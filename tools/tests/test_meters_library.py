"""Synthetic handoff/library/builder checks. Never access the user's drafts or drives."""
from copy import deepcopy
from functools import partial
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch, Mock
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT))
import meters_library as ml
import meters_designer as md


def fixtures():
    module = (ROOT / "meters/designer/v3/model.mjs").as_uri()
    source = f'import * as M from {json.dumps(module)}; ' + """
      const setups = M.names.map(name => {
        const s=M.defaults(); s.themes=[M.starter(name)]; s.initialTheme=s.themes[0].id;
        return M.validate(s);
      });
      const variants=[];
      for(const [type,def] of Object.entries(M.registry)) for(const variant of def.variants) {
        const s=M.defaults(); s.themes[0].pages[0].widgets=[M.widget(type,variant)];
        variants.push(M.validate(s));
      }
      console.log(JSON.stringify({setups,variants}));
    """
    return json.loads(subprocess.check_output(["node", "--input-type=module", "-e", source], cwd=ROOT))


class LibraryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixtures = fixtures()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        self.library = ml.Library(self.path / "library.sqlite3")
        self.setup = deepcopy(self.fixtures["setups"][0])

    def test_shared_javascript_starters_and_all_variants_are_accepted(self):
        for setup in self.fixtures["setups"] + self.fixtures["variants"]:
            ml.validate_setup(setup)

    def test_newer_instrument_options_are_checked_and_optional(self):
        widget = lambda s: s["themes"][0]["pages"][0]["widgets"][0]
        older = deepcopy(self.setup)
        for key in ("valuePosition", "zones", "shiftLead", "colorRamp", "readout"):
            widget(older).pop(key, None)
        ml.validate_setup(older)  # documents saved before these options existed
        for key, value in [("valuePosition", "left"), ("shiftLead", 9000), ("colorRamp", "yes"),
                           ("zones", {"mode": "custom", "base": None, "steps": [{"at": 5, "color": "#ff0000"},
                                                                               {"at": 1, "color": "#00ff00"}]}),
                           ("zones", {"mode": "custom", "base": "red", "steps": []})]:
            bad = deepcopy(self.setup)
            widget(bad)[key] = value
            with self.assertRaises(ValueError, msg=key):
                ml.validate_setup(bad)
        font = deepcopy(self.setup)
        font["themes"][0]["style"]["font"] = "Comic Sans"
        with self.assertRaises(ValueError):
            ml.validate_setup(font)
        for name in ml.FONTS:
            ok = deepcopy(self.setup)
            ok["themes"][0]["style"]["font"] = name
            ml.validate_setup(ok)

    def test_send_idempotency_update_and_persistent_include_choice(self):
        self.assertTrue(self.library.save(self.setup)["changed"])
        row = self.library.list()[0]
        self.assertEqual(row["selected"], 1)
        self.assertFalse(self.library.save(self.setup)["changed"])
        self.library.select([])
        self.setup["themes"][0]["name"] = "Updated Street"
        self.library.save(self.setup)
        self.assertEqual(len(self.library.list()), 1)
        reopened = ml.Library(self.library.path)
        self.assertEqual(reopened.list()[0]["selected"], 0)
        self.assertEqual(reopened.get(row["id"])["themes"][0]["name"], "Updated Street")

    def test_selection_limit_and_unknown_ids_are_transactional(self):
        for i in range(9):
            setup = deepcopy(self.setup)
            setup["themes"][0]["id"] = setup["initialTheme"] = f"custom-{i}"
            self.library.save(setup)
        rows = self.library.list()
        self.assertEqual(sum(row["selected"] for row in rows), 8)
        with self.assertRaises(ValueError):
            self.library.select([row["id"] for row in rows])
        with self.assertRaises(ValueError):
            self.library.select(["missing"])
        self.assertEqual(sum(row["selected"] for row in self.library.list()), 8)

    def test_invalid_send_preserves_saved_theme(self):
        self.library.save(self.setup)
        before = self.library.list()
        bad_cases = []
        for change in (
            lambda s: s.update(version=4),
            lambda s: s["themes"][0]["pages"][0]["widgets"][0].update(signal="arbitrary"),
            lambda s: s["themes"][0]["pages"][0]["widgets"][0].update(x=float("nan")),
            lambda s: s["themes"][0]["pages"][0]["widgets"][0].update(locked="false"),
            lambda s: s["themes"][0]["pages"][0].update(groups=[{"id":"g", "name":"bad", "locked":False,"widgetIds":["missing"]}]),
            lambda s: s.update(assets={"bad":{"data":"data:image/png;base64,AAAA","width":1,"height":1}}),
        ):
            invalid = deepcopy(self.setup)
            change(invalid)
            bad_cases.append(invalid)
        for invalid in bad_cases:
            with self.assertRaises((ValueError, TypeError)):
                self.library.save(invalid)
        self.assertEqual(self.library.list(), before)

    def test_selected_export_excludes_unchecked_and_checks_integrity(self):
        for setup in self.fixtures["setups"][:2]:
            self.library.save(setup)
        chosen = self.library.list()[1]["id"]
        self.library.select([chosen])
        destination = self.path / ml.SELECTION_NAME
        ml.write_selection(destination, self.library.selection())
        actual = json.loads(destination.read_text(encoding="utf-8"))
        self.assertEqual([item["id"] for item in actual["items"]], [chosen])
        ml.validate_selection(actual)
        actual["items"][0]["sha256"] = "0" * 64
        with self.assertRaises(ValueError):
            ml.validate_selection(actual)

    def test_export_is_written_atomically_and_rejects_an_invalid_selection(self):
        destination = self.path / "backup.json"
        self.library.save(self.setup)
        ml.write_selection(destination, self.library.selection())
        first = destination.read_bytes()
        bad = self.library.selection()
        bad["items"][0]["sha256"] = "0" * 64
        with self.assertRaises(ValueError):
            ml.write_selection(destination, bad)
        self.assertEqual(destination.read_bytes(), first)
        self.library.select([])
        ml.write_selection(destination, self.library.selection())
        self.assertEqual(json.loads(destination.read_text())["items"], [])
        self.assertEqual(sorted(p.name for p in self.path.glob(".meters-*")), [])
        self.assertFalse(hasattr(ml, "check_destination"))

    def test_corrupt_database_is_not_replaced(self):
        self.library.path.write_bytes(b"not a database")
        with self.assertRaises(Exception):
            self.library.list()
        self.assertEqual(self.library.path.read_bytes(), b"not a database")

    def test_api_origin_host_token_and_validation_guards(self):
        class Quiet(md.Handler):
            def log_message(self, *_args):
                pass
        server = md.Server(("127.0.0.1", 0), partial(Quiet, directory=str(md.ROOT)), self.library.path)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        base = f"http://127.0.0.1:{server.server_port}"
        with urlopen(base + "/api/builder/session") as response:
            connection = json.load(response)
        self.assertTrue(connection["testLibrary"])
        headers = {"Content-Type":"application/json", "Origin":base, "X-MiatOff-Token":connection["token"]}
        for altered in ({**headers,"Origin":"http://evil.example"}, {**headers,"X-MiatOff-Token":"bad"},
                        {**headers,"Host":"evil.example"}):
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(base + "/api/builder/pages", data=ml.encode(self.setup), headers=altered))
            self.assertEqual(error.exception.code, 403)
        with urlopen(Request(base + "/api/builder/pages", data=ml.encode(self.setup), headers=headers)) as response:
            self.assertTrue(json.load(response)["changed"])
        with self.assertRaises(HTTPError) as error:
            urlopen(Request(base + "/api/builder/pages", data=b'{"version":9}', headers=headers))
        self.assertEqual(error.exception.code, 422)
        self.assertEqual(len(ml.PageLibrary(self.library.path).list()), 2)


class PageLibraryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixtures = fixtures()

    setUp = LibraryTests.setUp

    def test_legacy_groups_become_individual_pages_and_original_records_remain(self):
        self.library.save(self.setup)
        original = self.library.list()
        pages = ml.PageLibrary(self.library.path)
        rows = pages.list()
        self.assertEqual([row["name"] for row in rows], ["DRIVE", "TELEMETRY"])
        self.assertTrue(all(row["pages"] == 1 for row in rows))
        self.assertEqual(self.library.list(), original)
        self.assertEqual(len(pages.list()), 2)  # Migration is idempotent.

    def test_sync_pushes_all_owners_preserves_choices_and_retires_removed_pages(self):
        project = deepcopy(self.setup)
        project["themes"].append(deepcopy(self.fixtures["setups"][1]["themes"][0]))
        library = ml.PageLibrary(self.library.path)
        self.assertEqual(library.sync(project)["pages"], 4)
        self.assertFalse(library.sync(project)["changed"])
        rows = library.list()
        library.select([rows[1]["id"]])
        project["themes"][0]["pages"][1]["name"] = "My telemetry"
        library.sync(project)
        self.assertEqual([row["id"] for row in library.list() if row["selected"]], [rows[1]["id"]])
        project["themes"][1]["pages"].pop()
        removed = library.plan_sync(project)["removed"]
        self.assertEqual(len(removed), 1)
        with self.assertRaises(ml.RemovalNotConfirmed):
            library.sync(project)
        self.assertEqual(len(library.list()), 4)
        library.sync(project, confirm_removal=[removed[0]["id"]])
        self.assertEqual(len(library.list()), 3)
        with library.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM retired_pages").fetchone()[0], 1)
        self.assertEqual(len(library.selection()["items"]), 1)

    def test_failed_collection_sync_is_atomic_and_page_style_survives(self):
        library = ml.PageLibrary(self.library.path)
        project = deepcopy(self.setup)
        project["themes"][0]["pages"][1]["style"] = {"color": "#abcdef"}
        library.sync(project)
        before = library.list()
        saved = library.get(before[1]["id"])
        self.assertEqual(saved["themes"][0]["style"]["color"], "#abcdef")
        invalid = deepcopy(project)
        invalid["themes"][0]["pages"][1]["widgets"][0]["signal"] = "unknown"
        with self.assertRaises(ValueError):
            library.sync(invalid)
        self.assertEqual(library.list(), before)


    def project_of_two_owners(self):
        project = deepcopy(self.setup)
        project["themes"].append(deepcopy(self.fixtures["setups"][1]["themes"][0]))
        return project

    def test_plan_names_pages_a_different_draft_would_remove_and_writes_nothing(self):
        library = ml.PageLibrary(self.library.path)
        library.sync(self.project_of_two_owners())
        before = library.list()
        draft_b = deepcopy(self.fixtures["setups"][2])
        plan = library.plan_sync(draft_b)
        self.assertEqual(sorted(item["name"] for item in plan["removed"]), sorted(row["name"] for row in before))
        self.assertEqual(library.list(), before)
        self.assertEqual(library.list_retired(), [])
        with self.assertRaises(ml.RemovalNotConfirmed) as refused:
            library.sync(draft_b)
        self.assertEqual(len(refused.exception.removed), 4)
        with self.assertRaises(ml.RemovalNotConfirmed):  # a partial confirmation is not enough
            library.sync(draft_b, confirm_removal=[before[0]["id"]])
        self.assertEqual(library.list(), before)

    def test_removed_pages_list_and_restore_unselected_without_losing_data(self):
        library = ml.PageLibrary(self.library.path)
        library.sync(self.project_of_two_owners())
        drive = library.list()[0]
        draft_b = deepcopy(self.fixtures["setups"][2])
        library.sync(draft_b, confirm_removal=[row["id"] for row in library.list()])
        self.assertNotIn(drive["id"], [row["id"] for row in library.list()])
        retired = library.list_retired()
        self.assertEqual(len(retired), 4)
        self.assertEqual(len(library.retired_signature()), 4)
        entry = next(row for row in retired if row["id"] == drive["id"])
        self.assertEqual(entry["name"], drive["name"])
        result = library.restore_retired(entry["id"], entry["sha256"])
        self.assertEqual(result["name"], drive["name"])
        restored = next(row for row in library.list() if row["id"] == drive["id"])
        self.assertEqual(restored["selected"], 0)
        self.assertEqual(library.get(drive["id"])["themes"][0]["name"], drive["name"])
        self.assertNotIn(drive["id"], [row["id"] for row in library.list_retired()])
        with self.assertRaises(ValueError):
            library.restore_retired(entry["id"], entry["sha256"])
        # The next Send from a draft without it offers it for removal again.
        self.assertIn(drive["id"], [item["id"] for item in library.plan_sync(draft_b)["removed"]])

    def test_restore_is_unselected_even_when_eight_are_selected_and_rejects_tampering(self):
        library = ml.PageLibrary(self.library.path)
        library.sync(self.setup)
        library.sync(deepcopy(self.fixtures["setups"][2]), confirm_removal=[row["id"] for row in library.list()])
        self.assertEqual(sum(row["selected"] for row in library.list()), 2)
        entry = library.list_retired()[0]
        library.restore_retired(entry["id"], entry["sha256"])
        self.assertEqual(next(r for r in library.list() if r["id"] == entry["id"])["selected"], 0)
        self.assertLessEqual(sum(row["selected"] for row in library.list()), 8)
        other = library.list_retired()[0]
        with library.connect() as db:
            db.execute("UPDATE retired_pages SET document=? WHERE id=?", (b"{}", other["id"]))
        with self.assertRaises(ValueError):
            library.restore_retired(other["id"], other["sha256"])
        self.assertIn(other["id"], [r["id"] for r in library.list_retired()])
        self.assertNotIn(other["id"], [r["id"] for r in library.list()])

    def legacy_database(self, extra=None):
        legacy = ml.Library(self.library.path)
        legacy.save(self.setup)
        for setup in extra or []:
            legacy.save(setup)
        return legacy

    def test_migration_skips_a_bad_record_and_keeps_the_rest(self):
        self.legacy_database()
        with self.library.connect() as db:
            bad = deepcopy(self.fixtures["setups"][1])
            bad["themes"][0]["pages"][0]["widgets"][0]["signal"] = "unknown"
            data = ml.encode(bad)
            db.execute("INSERT INTO themes VALUES (?,?,?,?,?,?,?,?)", ("bad-valid-hash", "Bad", data, hashlib.sha256(data).hexdigest(), "x", 1, 1, 1))
            db.execute("INSERT INTO themes VALUES (?,?,?,?,?,?,?,?)", ("bad-hash", "Bad2", data, "0" * 64, "x", 1, 1, 1))
            good = deepcopy(self.fixtures["setups"][3])
            data = ml.encode(good)
            db.execute("INSERT INTO themes VALUES (?,?,?,?,?,?,?,?)", ("late-good", "Late", data, hashlib.sha256(data).hexdigest(), "x", 1, 1, 1))
        before = self.library.list()
        pages = ml.PageLibrary(self.library.path)
        names = [row["name"] for row in pages.list()]  # does not raise
        self.assertIn("DRIVE", names)
        self.assertGreater(len(names), 2)  # the record after the bad ones migrated too
        skipped = pages.skipped_migrations()
        self.assertEqual(sorted(item["id"] for item in skipped), ["bad-hash", "bad-valid-hash"])
        self.assertTrue(all(item["reason"] and item["skipped"] for item in skipped))
        self.assertEqual(self.library.list(), before)  # original rows untouched
        self.assertEqual(len(ml.PageLibrary(self.library.path).skipped_migrations()), 2)  # stable on reopen

    def test_migration_collision_keeps_first_and_stores_second_in_removed_pages(self):
        second = deepcopy(self.setup)
        second["themes"][0]["id"] = second["initialTheme"] = "other-owner"
        second["themes"][0]["pages"][0]["name"] = "Second copy"
        self.legacy_database([second])
        pages = ml.PageLibrary(self.library.path)
        rows = pages.list()
        self.assertEqual([row["name"] for row in rows], ["DRIVE", "TELEMETRY"])  # first one wins
        retired = pages.list_retired()
        self.assertEqual([row["name"] for row in retired], ["Second copy"])
        self.assertEqual(pages.skipped_migrations(), [])
        restored = pages.restore_retired(retired[0]["id"], retired[0]["sha256"])  # id is taken: comes back as a copy
        self.assertNotEqual(restored["id"], retired[0]["id"])
        self.assertEqual([row["name"] for row in pages.list()], ["DRIVE", "TELEMETRY", "Second copy"])
        self.assertEqual(pages.list_retired(), [])
        rows = pages.list()
        pages.sync(deepcopy(self.fixtures["setups"][2]), confirm_removal=[r["id"] for r in rows])
        self.assertEqual(len(pages.list_retired()), 3)  # nothing was lost

    def test_api_plan_endpoint_and_unconfirmed_removal_is_refused_with_409(self):
        class Quiet(md.Handler):
            def log_message(self, *_args):
                pass
        server = md.Server(("127.0.0.1", 0), partial(Quiet, directory=str(md.ROOT)), self.library.path)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        base = f"http://127.0.0.1:{server.server_port}"
        with urlopen(base + "/api/builder/session") as response:
            token = json.load(response)["token"]
        headers = {"Content-Type": "application/json", "Origin": base, "X-MiatOff-Token": token}

        def post(path, body, extra=None):
            return urlopen(Request(base + path, data=ml.encode(body), headers={**headers, **(extra or {})}))
        with post("/api/builder/pages", self.setup) as response:
            self.assertEqual(json.load(response)["pages"], 2)
        other = self.fixtures["setups"][2]
        with post("/api/builder/pages/plan", other) as response:
            plan = json.load(response)
        self.assertEqual(sorted(item["name"] for item in plan["removed"]), ["DRIVE", "TELEMETRY"])
        self.assertEqual(len(ml.PageLibrary(self.library.path).list()), 2)  # dry run wrote nothing
        with self.assertRaises(HTTPError) as error:
            post("/api/builder/pages", other)
        self.assertEqual(error.exception.code, 409)
        self.assertEqual(len(json.load(error.exception)["removed"]), 2)
        with self.assertRaises(HTTPError) as error:  # ids that do not match the plan
            post("/api/builder/pages", other, {"X-MiatOff-Confirm-Removal": "screen-nothing"})
        self.assertEqual(error.exception.code, 409)
        self.assertEqual(len(ml.PageLibrary(self.library.path).list()), 2)
        ids = ",".join(item["id"] for item in plan["removed"])
        with post("/api/builder/pages", other, {"X-MiatOff-Confirm-Removal": ids}) as response:
            self.assertEqual(json.load(response)["removed"], 2)
        self.assertEqual(len(ml.PageLibrary(self.library.path).list_retired()), 2)
        with self.assertRaises(HTTPError) as error:  # same Host/Origin/token guards on the plan route
            urlopen(Request(base + "/api/builder/pages/plan", data=ml.encode(other), headers={**headers, "X-MiatOff-Token": "bad"}))
        self.assertEqual(error.exception.code, 403)


class LibraryLocationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_per_user_paths_follow_each_platform(self):
        home = self.root / "home"
        self.assertEqual(ml.user_library_path({"APPDATA": str(self.root / "roam")}, home, "win32"),
                         self.root / "roam" / "MiatOff" / ml.DB_NAME)
        self.assertEqual(ml.user_library_path({}, home, "win32"), home / "AppData" / "Roaming" / "MiatOff" / ml.DB_NAME)
        self.assertEqual(ml.user_library_path({}, home, "darwin"), home / "Library" / "Application Support" / "MiatOff" / ml.DB_NAME)
        self.assertEqual(ml.user_library_path({}, home, "linux"), home / ".local" / "share" / "MiatOff" / ml.DB_NAME)
        xdg = self.root / "xdg"
        self.assertEqual(ml.user_library_path({"XDG_DATA_HOME": str(xdg)}, home, "linux"), xdg / "MiatOff" / ml.DB_NAME)
        self.assertEqual(ml.user_library_path({"XDG_DATA_HOME": "relative"}, home, "linux"), home / ".local" / "share" / "MiatOff" / ml.DB_NAME)

    def test_env_override_wins_and_nothing_is_created(self):
        override = self.root / "mine.sqlite3"
        env = {"MIATOFF_METERS_LIBRARY": str(override), "APPDATA": str(self.root / "roam")}
        self.assertEqual(ml.resolve_library_path(env, self.root / "home", self.root / "old.sqlite3", "win32"), override)
        self.assertFalse((self.root / "roam").exists())

    def test_first_use_copies_the_old_library_and_never_touches_it(self):
        legacy = self.root / "checkout" / ".miatoff" / "custom-meters.sqlite3"
        old = ml.PageLibrary(legacy)
        old.sync(fixtures()["setups"][0])
        before = hashlib.sha256(legacy.read_bytes()).hexdigest()
        mtime = legacy.stat().st_mtime_ns
        env = {"APPDATA": str(self.root / "roam")}
        target = ml.resolve_library_path(env, self.root / "home", legacy, "win32")
        self.assertEqual(target, self.root / "roam" / "MiatOff" / ml.DB_NAME)
        self.assertEqual([r["name"] for r in ml.PageLibrary(target).list()], ["DRIVE", "TELEMETRY"])
        self.assertEqual(hashlib.sha256(legacy.read_bytes()).hexdigest(), before)
        self.assertEqual(legacy.stat().st_mtime_ns, mtime)
        self.assertEqual(sorted(p.name for p in target.parent.iterdir()), [ml.DB_NAME])  # no temp leftovers
        # Later changes stay in the per-user file; a second resolve does not copy again.
        ml.PageLibrary(target).select([])
        self.assertEqual(ml.resolve_library_path(env, self.root / "home", legacy, "win32"), target)
        self.assertEqual([r["selected"] for r in ml.PageLibrary(target).list()], [0, 0])
        self.assertEqual(hashlib.sha256(legacy.read_bytes()).hexdigest(), before)

    def test_no_old_library_means_no_files_and_failed_copy_keeps_using_the_old_one(self):
        env = {"APPDATA": str(self.root / "roam")}
        target = ml.resolve_library_path(env, self.root / "home", self.root / "missing.sqlite3", "win32")
        self.assertFalse(target.exists())
        legacy = self.root / "broken.sqlite3"
        legacy.write_bytes(b"not a database")
        with patch.object(sys, "stderr"):
            self.assertEqual(ml.resolve_library_path(env, self.root / "home", legacy, "win32"), legacy)
        self.assertEqual(legacy.read_bytes(), b"not a database")
        self.assertFalse((self.root / "roam" / "MiatOff" / ml.DB_NAME).exists())


class GuiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixtures = fixtures()

    setUp = LibraryTests.setUp

    def test_designer_tab_hints_that_meters_must_be_set_to_install(self):
        import miatoff_gui as gui
        with patch.dict("os.environ", {"MIATOFF_METERS_LIBRARY": str(self.library.path)}), patch.object(gui, "removable_drives", return_value=[]):
            app = gui.App()
        app.withdraw()
        self.addCleanup(app.destroy)
        app.tabs.select(app.designer_tab)
        app.update_idletasks()
        self.assertEqual(app.vars["meters"].get(), "keep")
        self.assertEqual(app.meters_hint.winfo_manager(), "pack")
        app.vars["meters"].set("install")
        self.assertEqual(app.meters_hint.winfo_manager(), "")
        app.vars["meters"].set("remove")
        self.assertEqual(app.meters_hint.winfo_manager(), "pack")
        button = [w for w in app.meters_hint.winfo_children() if isinstance(w, gui.ttk.Button)][0]
        button.invoke()
        self.assertEqual(app.tabs.select(), str(app.choose_tab))

    def test_home_menu_has_its_own_page_and_builds_no_stick(self):
        gui, app = self.make_app()
        self.assertIn("menu", app.rail_items)
        app.go("choose")
        app.update()  # Back returns to the last step, which the page-change event records
        app.go("menu")
        app.update()
        self.assertEqual(app.current(), "menu")
        def buttons(widget):
            found = [widget.cget("text")] if isinstance(widget, gui.ttk.Button) else []
            for child in widget.winfo_children():
                found += buttons(child)
            return found
        self.assertIn("Open designer", buttons(app.menu_tab))
        self.assertNotIn("Mazda Home", buttons(app.designer_tab))
        app.copy_designer_url("home")
        self.assertTrue(app.clipboard_get().endswith("/designer/index.html?mode=home"))
        with patch.object(app, "target") as target:
            app.run("build")
        target.assert_not_called()
        app.go_back()
        self.assertEqual(app.current(), "choose")

    def test_your_menus_and_custom_menu_under_choose_tweaks(self):
        gui, app = self.make_app()
        app.go("menu")
        app.update()
        texts = [w.cget("text").split("\n")[0] for w in app.home_list.winfo_children()
                 for w in w.winfo_children() if isinstance(w, gui.ttk.Radiobutton)]
        self.assertEqual(texts[:5], ["2077", "2077 Night", "Cyber", "Track", "Classic"])
        self.assertEqual(app.home_choice.get(), "")
        self.assertIn("No menu chosen", app.home_status.cget("text"))
        # Custom menu sits under Choose tweaks, outside the plan, with a picker in step with Your menus.
        self.assertIn("home", app.vars)
        self.assertNotIn("home", gui.KEYS)
        self.assertEqual(app.home_pick.get(), "Choose a menu")
        app.home_pick.current(app._home_ids.index("starter-track"))
        app._home_picked()
        self.assertEqual((app.home_menus.selected(), app.home_choice.get()), ("starter-track", "starter-track"))
        self.assertIn("Track", app.home_status.cget("text"))
        self.assertEqual(app.home_hint.winfo_manager(), "pack", "Custom menu is not set to Install yet")
        with patch("webbrowser.open") as browser, patch.object(app, "_ensure_designer", return_value=True):
            app.preview_home_menu("starter-track")
        self.assertTrue(browser.call_args[0][0].endswith("/designer/home/car-preview.html?menu=starter-track"))
        app.tabs.select(app.choose_tab)
        self.pick_stick(app)

        def build():
            builder = Mock()
            builder.verify.return_value = []
            ask, _info, error, _warn = self.run_action(gui, app, "build", builder)
            return builder, ask, error

        # Install without Meters: refused, nothing written.
        app.vars["home"].set("install")
        app.vars["meters"].set("remove")
        self.assertIn("Meters", app._home_reason())
        builder, ask, error = build()
        self.assertIn("Meters", error.call_args[0][1])
        ask.assert_not_called()
        app.vars["meters"].set("install")
        self.assertIsNone(app._home_reason())
        self.assertEqual(app.home_hint.winfo_manager(), "")
        builder, ask, error = build()
        error.assert_not_called()
        self.assertEqual(builder.home["name"], "Track")
        self.assertIn("Custom menu: Track", ask.call_args[0][1])
        app._refresh_review()
        self.assertIn("Custom menu: Track", [w.cget("text") for w in app.review_lines.winfo_children()])
        self.assertEqual(app.home_menus.built()["name"], "Track", "the stick's menu is remembered")
        # Leave as-is carries the last stick's menu again, even when another one is chosen now.
        app.home_pick.current(app._home_ids.index("starter-cyber"))
        app._home_picked()
        app.vars["home"].set("keep")
        builder, _ask, _error = build()
        self.assertEqual(builder.home["name"], "Track")
        app._refresh_review()
        self.assertIn("Custom menu: Track (on the last stick)", [w.cget("text") for w in app.review_lines.winfo_children()])
        # Mazda's Home: no menu, and Leave as-is keeps it that way.
        app.vars["home"].set("remove")
        builder, _ask, _error = build()
        self.assertIsNone(builder.home)
        self.assertIsNone(app.home_menus.built())
        app.vars["home"].set("keep")
        builder, _ask, _error = build()
        self.assertIsNone(builder.home)

    def make_app(self):
        import miatoff_gui as gui
        with patch.dict("os.environ", {"MIATOFF_METERS_LIBRARY": str(self.library.path)}), patch.object(gui, "removable_drives", return_value=[]):
            app = gui.App()
        app.withdraw()
        self.addCleanup(app.destroy)
        return gui, app

    def pick_stick(self, app):
        """The test folder as the chosen stick: it is not a USB drive, so require_stick_root is replaced in run_action."""
        import stickkit
        app.drive_infos = [stickkit.DriveInfo(root=str(self.path))]
        app.drive["values"] = [str(self.path)]
        app.drive.current(0)

    def run_action(self, gui, app, action, builder):
        def kit(custom=None, home=None):
            builder.custom = custom
            builder.home = home
            return builder
        def job(_label, work, done):  # the same work and result delivery, on this thread
            done(*gui.stickflow.run_captured(work))
        with patch.object(app, "kit", side_effect=kit), patch.object(app, "start_job", side_effect=job), \
             patch.object(gui.stickkit, "require_stick_root", builder.stickkit.require_stick_root), \
             patch.object(gui.messagebox, "askyesno", return_value=True) as ask, \
             patch.object(gui.messagebox, "showinfo") as info, patch.object(gui.messagebox, "showerror") as error, \
             patch.object(gui.messagebox, "showwarning") as warn:
            app.run(action)
        return ask, info, error, warn

    def test_gui_library_checkboxes_and_selection_goes_to_build_and_verify(self):
        gui, app = self.make_app()
        project = deepcopy(self.fixtures["setups"][0])
        project["themes"].append(deepcopy(self.fixtures["setups"][1]["themes"][0]))
        app.meters_library.sync(project)
        app.refresh_custom_meters()
        self.assertEqual(len(app.custom_vars), 4)
        ids = list(app.custom_vars)
        for key in ids[1:]:
            app.custom_vars[key].set(False)
        app._custom_meter_toggled(ids[1])
        self.assertEqual([item["id"] for item in app.meters_library.selection()["items"]], [ids[0]])
        app.tabs.select(app.choose_tab)
        app.vars["meters"].set("install")
        self.pick_stick(app)
        builder = Mock()
        builder.verify.return_value = []
        ask, info, error, _warn = self.run_action(gui, app, "build", builder)
        error.assert_not_called()
        bundle = builder.custom
        self.assertEqual([item["id"] for item in bundle["items"]], [ids[0]])
        self.assertIn("Applications > Meters > CUSTOM", ask.call_args[0][1])
        self.assertIn("Custom pages: 1", ask.call_args[0][1])
        builder.stickkit.require_stick_root.assert_called_once_with(self.path)
        self.assertEqual(builder.build.call_args.kwargs["plan"].count("meters=install"), 1)
        self.assertFalse((self.path / ml.SELECTION_NAME).exists())  # no archive on the stick root
        # Verify checks against the same selection.
        _ask, info, error, _warn = self.run_action(gui, app, "verify", builder)
        error.assert_not_called()
        self.assertEqual(builder.custom["items"], bundle["items"])
        # A changed selection reaches the next build; no pages means no custom argument.
        app.select_custom_meters(False)
        self.run_action(gui, app, "build", builder)
        self.assertIsNone(builder.custom)

    def test_install_is_allowed_for_installed_meters_as_an_update(self):
        gui, app = self.make_app()
        self.assertEqual(gui.allowed_options("installed"), {"install", "remove"})
        self.assertEqual(gui.allowed_options("available"), {"install"})
        verdict = {"components": {key: {"state": "available", "detail": ""} for key in gui.KEYS}}
        verdict["components"]["meters"] = {"state": "installed", "detail": ""}
        app.apply_verdict(verdict)
        self.assertEqual(str(app.options["meters"]["install"].cget("state")), "normal")
        self.assertEqual(app.options["meters"]["install"].cget("text"), "Update")
        verdict["components"]["meters"]["state"] = "available"
        app.apply_verdict(verdict)
        self.assertEqual(app.options["meters"]["install"].cget("text"), "Install")

    def test_broken_library_blocks_a_meters_build_but_not_another_stick(self):
        gui, app = self.make_app()
        key = next(k for k in gui.KEYS if k != "meters")
        app.tabs.select(app.choose_tab)
        app.vars[key].set("install")
        app.vars["meters"].set("keep")
        self.pick_stick(app)
        builder = Mock()
        with patch.object(app.meters_library, "selection", side_effect=RuntimeError("database is locked")):
            ask, info, error, _warn = self.run_action(gui, app, "build", builder)
            error.assert_not_called()
            self.assertTrue(app.stick_ready)
            self.assertIn("database is locked", ask.call_args[0][1])
            builder.build.assert_called_once()
            self.assertIsNone(builder.custom)
            self.assertEqual(builder.build.call_args.kwargs["plan"].count("meters=keep"), 1)
            # With Meters set to Install, the same failure stops the build.
            builder.reset_mock()
            app.vars["meters"].set("install")
            _ask, _info, error, _warn = self.run_action(gui, app, "build", builder)
            error.assert_called_once()
            self.assertIn("database is locked", error.call_args[0][1])
            builder.build.assert_not_called()

    def test_stick_without_meters_still_carries_the_current_selection(self):
        gui, app = self.make_app()
        app.meters_library.sync(self.fixtures["setups"][0])
        key = next(k for k in gui.KEYS if k != "meters")
        app.tabs.select(app.choose_tab)
        app.vars[key].set("install")
        self.pick_stick(app)
        builder = Mock()
        ask, _info, error, _warn = self.run_action(gui, app, "build", builder)
        error.assert_not_called()
        self.assertEqual(len(builder.custom["items"]), 2)
        self.assertIn("not reported as outdated", ask.call_args[0][1])

    def test_check_tab_builds_the_dump_stick_without_custom_pages(self):
        gui, app = self.make_app()
        app.tabs.select(app.check_tab)
        self.pick_stick(app)
        builder = Mock()
        with patch.object(app.meters_library, "selection", side_effect=AssertionError("not needed")):
            _ask, _info, error, _warn = self.run_action(gui, app, "build", builder)
        error.assert_not_called()
        builder.build.assert_called_once()
        self.assertEqual(builder.build.call_args.args, (self.path,))
        self.assertIsNone(builder.build.call_args.kwargs["plan"])  # a check stick carries no plan

    def show(self, app):
        app.deiconify()
        app.update()
        self.addCleanup(app.withdraw)

    def drives(self, *roots):
        import stickkit
        return [stickkit.DriveInfo(root=root, total=8_000_000_000, filesystem="FAT32", partition_style="mbr",
                                   partition_number=1, usb=True) for root in roots]

    def test_tweak_controls_work_from_the_keyboard_and_respect_what_is_allowed(self):
        gui, app = self.make_app()
        verdict = {"components": {key: {"state": "available", "detail": ""} for key in gui.KEYS}}
        app.apply_verdict(verdict)
        self.show(app)
        app.go("choose")
        app.update()
        segment = app.segments["delay"]
        segment.labels["keep"].focus_force()
        app.update()
        segment.labels["keep"].event_generate("<Right>")
        app.update()
        self.assertEqual(app.focus_get(), segment.labels["install"])
        segment.labels["install"].event_generate("<space>")
        app.update()
        self.assertEqual(app.vars["delay"].get(), "install")
        segment.labels["install"].event_generate("<Right>")  # Remove is not allowed on an available tweak
        app.update()
        self.assertEqual(app.focus_get(), segment.labels["install"])
        self.assertEqual(str(segment.labels["remove"].cget("takefocus")), "0")
        segment.choose("remove")
        self.assertEqual(app.vars["delay"].get(), "install")

    def test_tweaks_are_locked_until_a_check_or_the_explicit_override(self):
        gui, app = self.make_app()
        self.assertFalse(app.segments["delay"].enabled("install"))
        app.override.set(True)
        app._override_changed()
        self.assertTrue(app.segments["delay"].enabled("install") and app.segments["delay"].enabled("remove"))

    def test_choosing_another_stick_clears_the_check_and_the_override(self):
        gui, app = self.make_app()
        app.refresh(self.drives("E:\\"))
        app.verdict = {"components": {}}
        app.override.set(True)
        app.stick_ready = True
        app.refresh(self.drives("F:\\"))
        self.assertIsNone(app.verdict)
        self.assertFalse(app.override.get())
        self.assertFalse(app.stick_ready)

    def test_pulling_the_stick_out_keeps_the_usb_ready_instructions(self):
        gui, app = self.make_app()
        app.refresh(self.drives("E:\\"))
        app.verdict = {"components": {}}
        app.stick_ready = True
        app.review_result.pack(fill="x")
        app.refresh([])
        self.assertIsNone(app.verdict)  # the check needs the stick again
        self.assertTrue(app.stick_ready)
        self.assertEqual(app.review_result.winfo_manager(), "pack")

    def test_a_build_runs_on_a_worker_thread_and_a_failure_reaches_the_user(self):
        gui, app = self.make_app()
        import threading
        import time
        app.go("choose")
        app.update()
        app.vars["delay"].set("install")
        self.pick_stick(app)
        seen = []
        builder = Mock()
        builder.build.side_effect = lambda *_a, **_k: (seen.append(threading.current_thread()), (_ for _ in ()).throw(SystemExit("ERROR: out of room")))
        with patch.object(app, "kit", return_value=builder), patch.object(gui.stickkit, "require_stick_root"), \
             patch.object(gui.messagebox, "askyesno", return_value=True), patch.object(gui.messagebox, "showerror") as error:
            app.run("build")
            self.assertTrue(app.jobs.busy)
            self.assertEqual(str(app.primary_button.cget("state")), "disabled")
            for _ in range(300):
                app.jobs.poll()
                if not app.jobs.busy:
                    break
                time.sleep(0.01)
        self.assertIsNot(seen[0], threading.main_thread())
        self.assertFalse(app.jobs.busy)
        self.assertEqual(error.call_args[0][1], "out of room")
        self.assertFalse(app.stick_ready)

    def test_first_time_user_makes_check_stick_then_install_stick_on_the_same_usb(self):
        import kits
        gui, app = self.make_app()
        self.pick_stick(app)
        results = self.path / "miatoff-dumps" / "001-full" / "SUMMARY.txt"
        results.parent.mkdir(parents=True)
        results.write_text("fabricated")

        def job(_label, work, done):
            done(*gui.stickflow.run_captured(work))
        with patch.object(app, "start_job", side_effect=job), patch.object(gui.stickkit, "require_stick_root"),              patch.object(gui.messagebox, "askyesno", return_value=True) as ask, patch.object(gui.messagebox, "showerror") as error:
            app.tabs.select(app.check_tab)
            app.update()
            app.run("build")
            error.assert_not_called()
            self.assertEqual(kits.dump_kit().verify(self.path), [])
            app.tabs.select(app.review_tab)
            app.update()
            app.vars["delay"].set("install")
            app.run("build")
            error.assert_not_called()
            self.assertIn("MiatOff check files", ask.call_args[0][1])
        self.assertEqual(kits.install_kit().verify(self.path), [])
        self.assertTrue(app.stick_ready)
        self.assertIn("delay=install", (self.path / "miatoff-plan.txt").read_text())
        self.assertEqual(results.read_text(), "fabricated")
        self.assertFalse((self.path / "dump.sh").exists())

    def test_closing_is_refused_while_a_job_runs(self):
        gui, app = self.make_app()
        app.jobs.busy = True
        with patch.object(gui.messagebox, "showwarning") as warn:
            app._close()
        warn.assert_called_once()
        self.assertTrue(app.winfo_exists())
        app.jobs.busy = False

    def test_removed_pages_section_restores_and_skipped_records_show_a_notice(self):
        gui, app = self.make_app()
        app.meters_library.sync(self.fixtures["setups"][0])
        app.meters_library.sync(self.fixtures["setups"][2], confirm_removal=[r["id"] for r in app.meters_library.list()])
        app.refresh_custom_meters()
        self.assertEqual(len(app.removed_rows), 2)
        retired = app.meters_library.list_retired()[0]
        app.restore_removed_page(retired["id"], retired["sha256"])
        self.assertEqual(len(app.removed_rows), 1)
        self.assertIn(retired["id"], app.custom_vars)
        self.assertFalse(app.custom_vars[retired["id"]].get())
        self.assertFalse(app.custom_notice.winfo_manager())
        with app.meters_library.connect() as db:
            db.execute("INSERT INTO migration_skipped VALUES ('x','broken','now')")
        app.refresh_custom_meters()
        self.assertEqual(app.custom_notice.winfo_manager(), "pack")
        self.assertIn("1 older saved theme", app.custom_notice.cget("text"))


if __name__ == "__main__":
    unittest.main()
