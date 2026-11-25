/* SPDX-License-Identifier: GPL-3.0-or-later */
#define _GNU_SOURCE
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <linux/input.h>
#include <poll.h>
#include <signal.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/prctl.h>
#include <sys/stat.h>
#include <sys/sysmacros.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

/* DIALOG_FAILED: jci-dialog ended without a button index, so the caller treats it like a failed touch dialog. */
enum { DISMISS = 3, UNAVAILABLE = 4, DIALOG_FAILED = 5, RUNNING = -1 };
enum { POLL_MS = 25, REDRAW_MS = 75, SETTLE_MS = 350, CLOSE_MS = 200, DEADLINE_MS = 120000 };

struct prompt {
    const char *dialog, *title, *text;
    const char *const *labels;
    const char *order;
    int count, polarity;
};

struct selection {
    int focus, shown;                 /* positions in on-screen order */
    int64_t redraw_at, arm_at;
    bool armed, enter_down, enter_started, back_started;
};

struct media {
    const char *marker;
    struct stat original;
    char block[64];
    int fd;
};

static volatile sig_atomic_t interrupted;

static void stop(int signal_number)
{
    (void)signal_number;
    interrupted = 1;
}

static bool on_parent_exit(int signal_number, pid_t parent)
{
    return parent > 1 && prctl(PR_SET_PDEATHSIG, signal_number) == 0 && getppid() == parent;
}

static int64_t now_ms(void)
{
    struct timespec t;
    if (clock_gettime(CLOCK_MONOTONIC, &t) < 0)
        return -1;
    return (int64_t)t.tv_sec * 1000 + t.tv_nsec / 1000000;
}

static bool media_open(struct media *media)
{
    /* FAT numbers an inode again when it is read back from disk. An open file keeps its number. */
    media->fd = open(media->marker, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (media->fd < 0 || fstat(media->fd, &media->original) < 0 || !S_ISREG(media->original.st_mode))
        return false;
    snprintf(media->block, sizeof(media->block), "/sys/dev/block/%u:%u",
             major(media->original.st_dev), minor(media->original.st_dev));
    /* An unplug can leave a mounted filesystem visible briefly. Track its block device too. */
    if (access(media->block, F_OK) < 0)
        media->block[0] = '\0';
    return true;
}

static bool media_present(const struct media *media)
{
    struct stat current;
    return lstat(media->marker, &current) == 0 && S_ISREG(current.st_mode) &&
           current.st_dev == media->original.st_dev && current.st_ino == media->original.st_ino &&
           (!media->block[0] || access(media->block, F_OK) == 0);
}

static bool bit(const unsigned char *bytes, unsigned int number)
{
    return (bytes[number / 8] & (1u << (number % 8))) != 0;
}

/* On the stock 74.00.324A unit "Virtual Keyboard" carries the Commander: KEY_N and KEY_M for each turn detent, the
 * arrow keys for tilt. Mazda's "filtered-keyboard-..." device repeats it, and Mazda Home reacts to it. The helper
 * reads the Virtual Keyboard and holds both with EVIOCGRAB while a prompt is open, so the turns do not also move
 * Home. The kernel lets go when the helper exits, however it ends. WATCH devices are only logged by the probe. */
enum { KEYS = 1, SHIELD = 2, WATCH = 4, MAX_INPUTS = 16, LOG_LINES = 4000, GRAB_WAIT_MS = 2000 };

struct input {
    int fd, role;
    bool dropped;
    char node[16];
};

struct inputs {
    struct input item[MAX_INPUTS];
    int count;
};

static int logged;

static int input_role(int fd, char *name, size_t name_size, char *signature, size_t size)
{
    struct input_id id;
    unsigned char keys[(KEY_MAX + 8) / 8] = {0};
    memset(name, 0, name_size);
    snprintf(signature, size, "?");
    if (ioctl(fd, EVIOCGNAME(name_size - 1), name) < 0 || ioctl(fd, EVIOCGID, &id) < 0)
        return 0;
    snprintf(signature, size, "%04x:%04x:%04x:%04x", id.bustype, id.vendor, id.product, id.version);
    if (!strncmp(name, "filtered-keyboard-", 18))
        return SHIELD;
    if (!strcmp(name, "Virtual Keyboard") && ioctl(fd, EVIOCGBIT(EV_KEY, sizeof(keys)), keys) >= 0 &&
        bit(keys, KEY_N) && bit(keys, KEY_M) && bit(keys, KEY_ENTER) && bit(keys, KEY_BACKSPACE))
        return KEYS;
    return 0;
}

static bool add_input(struct inputs *inputs, int fd, int role, const char *node)
{
    if (inputs->count == MAX_INPUTS)
        return false;
    struct input *input = &inputs->item[inputs->count++];
    *input = (struct input){.fd = fd, .role = role};
    snprintf(input->node, sizeof(input->node), "%.15s", node);
    return true;
}

#ifdef MIATOFF_COMMANDER_TEST
static bool add_fixture(struct inputs *inputs, const char *variable, int role)
{
    const char *path = getenv(variable);
    if (!path)
        return true;
    int fd = open(path, O_RDONLY | O_NONBLOCK | O_CLOEXEC);
    if (fd < 0)
        return false;
    if (add_input(inputs, fd, role, variable + strlen("MO_COMMANDER_")))
        return true;
    close(fd);
    return false;
}
#endif

/* wanted is the Virtual Keyboard's bus:vendor:product:version, and the installer needs exactly one. "-" is the
 * probe: any ID, every other device is watched and logged, and without a Virtual Keyboard only touch answers. */
static bool open_inputs(const char *wanted, bool probe, struct inputs *inputs)
{
    inputs->count = 0;
#ifdef MIATOFF_COMMANDER_TEST
    if (getenv("MO_COMMANDER_EVENTS"))
        return add_fixture(inputs, "MO_COMMANDER_EVENTS", KEYS) &&
               add_fixture(inputs, "MO_COMMANDER_WATCH_EVENTS", WATCH);
#endif
    if (!probe && strlen(wanted) != 19)
        return false;
    DIR *devices = opendir("/dev/input");
    if (!devices)
        return false;
    struct dirent *entry;
    int keyboards = 0;
    bool unkept = false;  /* a device to hold that could not be kept: never run with Home half shielded */
    char path[64], name[64], signature[20];
    while ((entry = readdir(devices))) {
        const char *node = entry->d_name;
        if (strncmp(node, "event", 5) || !node[5] || strspn(node + 5, "0123456789") != strlen(node + 5) ||
            strlen(node) >= sizeof(inputs->item[0].node))
            continue;
        snprintf(path, sizeof(path), "/dev/input/%.15s", node);
        int fd = open(path, O_RDONLY | O_NONBLOCK | O_CLOEXEC | O_NOFOLLOW);
        if (fd < 0) {
            if (probe)
                fprintf(stderr, "Commander: %s cannot be opened (%s)\n", node, strerror(errno));
            continue;
        }
        int role = input_role(fd, name, sizeof(name), signature, sizeof(signature));
        if (role == KEYS && !probe && strcmp(wanted, signature))
            role = 0;
        if (role == KEYS && keyboards++) {
            fprintf(stderr, "Commander: more than one Virtual Keyboard\n");
            role = SHIELD;
        }
        if (probe)
            fprintf(stderr, "Commander: %s \"%s\" %s%s\n", node, name, signature,
                    role == KEYS ? " Commander, held during the prompt" : role == SHIELD ? " held during the prompt" : "");
        if ((!role && !probe) || !add_input(inputs, fd, role ? role : WATCH, node)) {
            close(fd);
            unkept = unkept || role;
        }
    }
    closedir(devices);
    if (!probe)
        return keyboards == 1 && !unkept;
    if (!keyboards)
        fprintf(stderr, "Commander: no Virtual Keyboard with KEY_N, KEY_M, KEY_ENTER and KEY_BACKSPACE\n");
    return inputs->count > 0;
}

/* Grab first, then look at the keys: one already down was pressed while Mazda still saw the device, so let go
 * and wait for its release, or Mazda would keep it held for the whole prompt. */
static bool grab(int fd)
{
    unsigned char keys[(KEY_MAX + 8) / 8];
    for (int waited = 0; waited <= GRAB_WAIT_MS; waited += 20) {
        if (ioctl(fd, EVIOCGRAB, 1) < 0)
            return false;
        memset(keys, 0, sizeof(keys));
        if (ioctl(fd, EVIOCGKEY(sizeof(keys)), keys) < 0) {
            ioctl(fd, EVIOCGRAB, 0);
            return false;
        }
        bool held = false;
        for (size_t i = 0; i < sizeof(keys); ++i)
            held = held || keys[i];
        if (!held)
            return true;
        ioctl(fd, EVIOCGRAB, 0);
        nanosleep(&(struct timespec){.tv_nsec = 20 * 1000000}, NULL);
    }
    return false;
}

static bool grab_keyboards(const struct inputs *inputs, bool probe)
{
#ifdef MIATOFF_COMMANDER_TEST
    if (getenv("MO_COMMANDER_EVENTS"))
        return true;
#endif
    bool held = true;
    for (int i = 0; i < inputs->count; ++i) {
        const struct input *input = &inputs->item[i];
        if (input->role == WATCH)
            continue;
        bool ok = grab(input->fd);
        if (probe)
            fprintf(stderr, "Commander: %s %s\n", input->node, ok ? "held" : "could not be held");
        held = held && ok;
    }
    return held;
}

static void close_inputs(struct inputs *inputs)
{
    for (int i = 0; i < inputs->count; ++i)
        close(inputs->item[i].fd);
    inputs->count = 0;
}

static bool sync_keys(const struct inputs *inputs, struct selection *selection)
{
    unsigned char keys[(KEY_MAX + 8) / 8] = {0};
    selection->enter_started = false;
    selection->back_started = false;
#ifdef MIATOFF_COMMANDER_TEST
    if (getenv("MO_COMMANDER_EVENTS")) {
        selection->enter_down = getenv("MO_COMMANDER_ENTER_HELD") != NULL;
        return true;
    }
#endif
    for (int i = 0; i < inputs->count; ++i) {
        if ((inputs->item[i].role & KEYS) && ioctl(inputs->item[i].fd, EVIOCGKEY(sizeof(keys)), keys) < 0)
            return false;
    }
    selection->enter_down = bit(keys, KEY_ENTER);
    return true;
}

static bool any_dropped(const struct inputs *inputs)
{
    for (int i = 0; i < inputs->count; ++i) {
        if (inputs->item[i].dropped)
            return true;
    }
    return false;
}

static void log_event(const struct input *input, const struct input_event *event)
{
    if ((event->type == EV_SYN && event->code == SYN_REPORT) || logged > LOG_LINES)
        return;
    if (logged++ == LOG_LINES)
        fprintf(stderr, "Commander: event log full\n");
    else
        fprintf(stderr, "Commander: %s type %u code %u value %d\n", input->node, event->type, event->code,
                event->value);
}

static void rotate(const struct prompt *prompt, struct selection *selection, int64_t delta, int64_t now)
{
    int count = prompt->count;
    if (!delta)
        return;
    int previous = selection->focus;
    if (previous < 0)
        previous = delta > 0 ? count - 1 : 0;
    selection->focus = (previous + delta % count + count) % count;
    selection->redraw_at = now + REDRAW_MS;
    if (selection->arm_at < selection->redraw_at)
        selection->arm_at = selection->redraw_at;
    selection->armed = false;
    selection->enter_started = false;
}

static int input_event(struct input *input, const struct inputs *inputs, const struct prompt *prompt,
                       struct selection *selection, const struct input_event *event, int64_t now, bool probe)
{
    if (probe)
        log_event(input, event);
    if (input->role != KEYS)
        return RUNNING;
    if (event->type == EV_SYN && event->code == SYN_DROPPED) {
        input->dropped = true;
        selection->armed = false;
        selection->enter_started = false;
    } else if (input->dropped) {
        if (event->type == EV_SYN && event->code == SYN_REPORT) {
            if ((input->role & KEYS) && !sync_keys(inputs, selection))
                return DISMISS;
            input->dropped = false;
        }
    } else if (event->type == EV_KEY && (event->code == KEY_M || event->code == KEY_N)) {
        /* One press per detent; KEY_M is clockwise in the Mazda mapping. Autorepeat (value 2) is not a detent. */
        if (event->value == 1)
            rotate(prompt, selection, (event->code == KEY_M ? 1 : -1) * prompt->polarity, now);
    } else if (event->type == EV_KEY && event->code == KEY_ENTER) {
        if (event->value == 1 && !selection->enter_down) {
            selection->enter_down = true;
            selection->enter_started = selection->armed && selection->shown >= 0;
        } else if (event->value == 0) {
            bool choose = selection->enter_started && selection->armed;
            selection->enter_down = selection->enter_started = false;
            if (choose) {
                if (probe)
                    fprintf(stderr, "Commander: fresh Enter selected button %c\n", prompt->order[selection->shown]);
                return prompt->order[selection->shown] - '0';
            }
        }
    } else if (event->type == EV_KEY && event->code == KEY_BACKSPACE) {
        if (event->value == 1)
            selection->back_started = true;
        else if (event->value == 0 && selection->back_started) {
            if (probe)
                fprintf(stderr, "Commander: Back dismissed the prompt\n");
            return DISMISS;
        }
    }
    return RUNNING;
}

static char *dialog_option(const char *option, const char *value, bool selected)
{
    char *result = NULL;
    if (asprintf(&result, selected ? "%s=[%s]" : "%s=%s", option, value) < 0)
        return NULL;
    return result;
}

static pid_t show_dialog(const struct prompt *prompt, int position)
{
    const char *options[] = {"--title", "--text", "--ok-label", "--cancel-label", "--button3-label"};
    const char *values[] = {prompt->title, prompt->text, prompt->labels[0], prompt->labels[1],
                            prompt->count == 3 ? prompt->labels[2] : NULL};
    char *args[8] = {(char *)prompt->dialog, prompt->count == 3 ? "--3-button-dialog" : "--confirm", NULL};
    int selected = position < 0 ? -1 : prompt->order[position] - '0';
    pid_t child = -1;
    for (int i = 0; i < prompt->count + 2; ++i) {
        args[i + 2] = dialog_option(options[i], values[i], i - 2 == selected && i >= 2);
        if (!args[i + 2])
            goto done;
    }
    pid_t parent = getpid();
    child = fork();
    if (!child) {
        /* SIGTERM, like the installer's killall, lets jci-dialog take its window off the screen. */
        if (!on_parent_exit(SIGTERM, parent))
            _exit(127);
        execv(prompt->dialog, args);
        _exit(127);
    }
done:
    for (int i = 0; i < prompt->count + 2; ++i)
        free(args[i + 2]);
    return child;
}

static int exit_result(pid_t waited, int status, int count)
{
    if (waited > 0 && WIFEXITED(status) && WEXITSTATUS(status) < count)
        return WEXITSTATUS(status);
    return DIALOG_FAILED;
}

static pid_t wait_child(pid_t child, int *status, int options)
{
    pid_t waited;
    do {
        waited = waitpid(child, status, options);
    } while (waited < 0 && errno == EINTR);
    return waited;
}

/* Only an exit before we signal the child can be a touch choice. To close it, send SIGTERM as the installer's
 * killall does, so jci-dialog can take its window off the screen, and SIGKILL only if it is still there after
 * CLOSE_MS. Whatever it exits with after our signal is discarded: a dialog may exit 0 or 1 on SIGTERM. */
static int reap_dialog(pid_t *child, int count, bool closing)
{
    int status;
    if (*child <= 0)
        return RUNNING;
    pid_t waited = wait_child(*child, &status, WNOHANG);
    if (waited) {
        *child = -1;
        return exit_result(waited, status, count);
    }
    if (!closing)
        return RUNNING;
    kill(*child, SIGTERM);
    for (int waited_ms = 0; !waited && waited_ms < CLOSE_MS; waited_ms += 10) {
        nanosleep(&(struct timespec){.tv_nsec = 10 * 1000000}, NULL);
        waited = wait_child(*child, &status, WNOHANG);
    }
    if (!waited) {
        kill(*child, SIGKILL);
        waited = wait_child(*child, &status, 0);
    }
    *child = -1;
    return waited > 0 ? RUNNING : DIALOG_FAILED;
}

/* Lost Commander input ends the prompt. A watched device that goes away is only dropped from the poll. */
static bool input_lost(struct inputs *inputs, struct pollfd *polls, int i, bool probe)
{
    if (inputs->item[i].role != WATCH)
        return true;
    if (probe)
        fprintf(stderr, "Commander: %s closed\n", inputs->item[i].node);
    polls[i].fd = -1;
    return false;
}

static bool commander_lost(const struct inputs *inputs, struct pollfd *polls)
{
    if (poll(polls, inputs->count, 0) < 0)
        return true;
    for (int i = 0; i < inputs->count; ++i) {
        if (inputs->item[i].role != WATCH && (polls[i].revents & (POLLERR | POLLHUP | POLLNVAL)))
            return true;
    }
    return false;
}

static int run_prompt(const struct prompt *prompt, const struct media *media, struct inputs *inputs, bool probe)
{
    struct selection selection = {.focus = -1, .shown = -1};
    for (int i = 0; i < prompt->count; ++i) {
        if (!strcmp(prompt->labels[prompt->order[i] - '0'], "CANCEL"))
            selection.focus = i;
    }
    if (!sync_keys(inputs, &selection))
        return UNAVAILABLE;
    int64_t now = now_ms();
    if (now < 0 || interrupted || !media_present(media))
        return DISMISS;
    int64_t deadline = now + DEADLINE_MS;
#ifdef MIATOFF_COMMANDER_TEST
    if (getenv("MO_COMMANDER_SHORT_TIMEOUT"))
        deadline = now + 800;
#endif
    pid_t child = show_dialog(prompt, selection.focus);
    if (child < 0)
        return UNAVAILABLE;
    selection.shown = selection.focus;
    selection.arm_at = now + SETTLE_MS;

    int result = DISMISS;
    struct pollfd polls[MAX_INPUTS];
    for (int i = 0; i < inputs->count; ++i)
        polls[i] = (struct pollfd){.fd = inputs->item[i].fd, .events = POLLIN};
    while (!interrupted && (now = now_ms()) >= 0 && now < deadline && media_present(media)) {
        int touch = reap_dialog(&child, prompt->count, false);
        if (touch != RUNNING) {
            result = touch;
            break;
        }
        if (selection.focus != selection.shown && now >= selection.redraw_at) {
            touch = reap_dialog(&child, prompt->count, true);
            if (touch != RUNNING) {
                result = touch;
                break;
            }
            child = show_dialog(prompt, selection.focus);
            if (child < 0) {
                result = DIALOG_FAILED;
                break;
            }
            selection.shown = selection.focus;
            selection.arm_at = now_ms() + SETTLE_MS;
        }
        int ready = poll(polls, inputs->count, POLL_MS);
        if (ready < 0 && errno == EINTR)
            continue;
        if (ready < 0)
            break;
        /* Arm after a quiet poll of the Commander keyboard; activity on any other device does not count. */
        bool quiet = true;
        for (int n = 0; n < inputs->count; ++n)
            quiet = quiet && (inputs->item[n].role != KEYS || !polls[n].revents);
        if (quiet && !any_dropped(inputs) && selection.focus == selection.shown && now_ms() >= selection.arm_at)
            selection.armed = true;
        if (!ready)
            continue;
        for (int n = 0; n < inputs->count; ++n) {
            if (polls[n].fd < 0 || !polls[n].revents)
                continue;
            if (polls[n].revents & (POLLERR | POLLHUP | POLLNVAL)) {
                if (input_lost(inputs, polls, n, probe))
                    goto done;
                continue;
            }
            struct input_event events[32];
            ssize_t bytes = read(polls[n].fd, events, sizeof(events));
            if (bytes < 0 && (errno == EINTR || errno == EAGAIN))
                continue;
            if (bytes <= 0 || (size_t)bytes % sizeof(events[0])) {
                if (input_lost(inputs, polls, n, probe))
                    goto done;
                continue;
            }
            for (size_t i = 0; i < (size_t)bytes / sizeof(events[0]); ++i) {
                int pressed = input_event(&inputs->item[n], inputs, prompt, &selection, &events[i], now_ms(), probe);
                if (pressed == RUNNING)
                    continue;
                touch = reap_dialog(&child, prompt->count, false);
                result = pressed;
                if (pressed != DISMISS && touch != RUNNING)
                    result = touch;
                goto done;
            }
        }
    }
done:
    reap_dialog(&child, prompt->count, true);
    /* A child exit, input disconnect and deadline can all become ready in one poll. */
    now = now_ms();
    if (result == DISMISS || interrupted || now < 0 || now >= deadline || !media_present(media))
        return DISMISS;
    if (commander_lost(inputs, polls))
        return DISMISS;
    return result;
}

static bool valid_order(const char *order, int count)
{
    if (strlen(order) != (size_t)count)
        return false;
    unsigned int used = 0;
    for (int i = 0; i < count; ++i) {
        int position = order[i] - '0';
        if (position < 0 || position >= count)
            return false;
        used |= 1u << position;
    }
    return used == (1u << count) - 1;
}

int main(int argc, char **argv)
{
    if (argc == 2 && !strcmp(argv[1], "--check-runtime"))
        return 0;
    /* dialog marker inputs polarity order title text ok cancel [third]; inputs is <keys ID>/<wheel ID> or - */
    if (argc != 10 && argc != 11)
        return UNAVAILABLE;
    struct prompt prompt = {.dialog = argv[1], .title = argv[6], .text = argv[7],
                            .labels = (const char *const *)&argv[8], .order = argv[5],
                            .count = argc - 8, .polarity = !strcmp(argv[4], "+") ? 1 : -1};
    if ((strcmp(argv[4], "+") && strcmp(argv[4], "-")) ||
        !valid_order(prompt.order, prompt.count) || access(prompt.dialog, X_OK) < 0)
        return UNAVAILABLE;
    struct sigaction action = {.sa_handler = stop};
    sigemptyset(&action.sa_mask);
    if (sigaction(SIGHUP, &action, NULL) < 0 || sigaction(SIGTERM, &action, NULL) < 0 ||
        sigaction(SIGINT, &action, NULL) < 0 || !on_parent_exit(SIGTERM, getppid()))
        return DISMISS;
    struct media media = {.marker = argv[2]};
    if (!media_open(&media))
        return DISMISS;
    bool probe = !strcmp(argv[3], "-");
    struct inputs inputs;
    /* The probe also runs when a keyboard cannot be held, so its log shows what Mazda still receives. */
    if (!open_inputs(argv[3], probe, &inputs) || (!grab_keyboards(&inputs, probe) && !probe)) {
        close_inputs(&inputs);
        return UNAVAILABLE;
    }
    int result = run_prompt(&prompt, &media, &inputs, probe);
    close_inputs(&inputs);
    return result;
}
