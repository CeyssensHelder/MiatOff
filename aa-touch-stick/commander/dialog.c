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
enum { POLL_MS = 25, REDRAW_MS = 75, SETTLE_MS = 350, DEADLINE_MS = 120000 };

struct prompt {
    const char *dialog, *title, *text;
    const char *const *labels;
    const char *order;
    int count, polarity;
};

struct selection {
    int focus, shown;                 /* positions in on-screen order */
    int64_t redraw_at, arm_at;
    bool armed, enter_down, enter_started, back_started, dropped;
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

static bool input_matches(int fd, const char *wanted, char *signature, size_t size)
{
    char name[64] = {0};
    struct input_id id;
    unsigned char keys[(KEY_MAX + 8) / 8] = {0}, axes[(REL_MAX + 8) / 8] = {0};
    if (ioctl(fd, EVIOCGNAME(sizeof(name) - 1), name) < 0 || strcmp(name, "Virtual Keyboard") ||
        ioctl(fd, EVIOCGID, &id) < 0 ||
        ioctl(fd, EVIOCGBIT(EV_KEY, sizeof(keys)), keys) < 0 ||
        ioctl(fd, EVIOCGBIT(EV_REL, sizeof(axes)), axes) < 0 ||
        !bit(keys, KEY_ENTER) || !bit(keys, KEY_BACKSPACE) || !bit(axes, REL_HWHEEL))
        return false;
    snprintf(signature, size, "%04x:%04x:%04x:%04x", id.bustype, id.vendor, id.product, id.version);
    return !strcmp(wanted, "-") || !strcmp(wanted, signature);
}

static int open_input(const char *wanted)
{
#ifdef MIATOFF_COMMANDER_TEST
    const char *fixture = getenv("MO_COMMANDER_EVENTS");
    if (fixture)
        return open(fixture, O_RDONLY | O_NONBLOCK | O_CLOEXEC);
#endif
    DIR *devices = opendir("/dev/input");
    if (!devices)
        return -1;
    struct dirent *entry;
    int found = -1;
    char path[64], signature[20], found_signature[20];
    while ((entry = readdir(devices))) {
        const char *name = entry->d_name;
        if (strncmp(name, "event", 5) || !name[5] || strspn(name + 5, "0123456789") != strlen(name + 5) ||
            snprintf(path, sizeof(path), "/dev/input/%s", name) >= (int)sizeof(path))
            continue;
        int fd = open(path, O_RDONLY | O_NONBLOCK | O_CLOEXEC | O_NOFOLLOW);
        if (fd < 0)
            continue;
        if (!input_matches(fd, wanted, signature, sizeof(signature))) {
            close(fd);
            continue;
        }
        if (found >= 0) {
            fprintf(stderr, "Commander: more than one matching input device\n");
            close(fd);
            close(found);
            found = -1;
            break;
        }
        found = fd;
        strcpy(found_signature, signature);
    }
    closedir(devices);
    if (found >= 0)
        fprintf(stderr, "Commander: Virtual Keyboard %s (REL_HWHEEL, KEY_ENTER, KEY_BACKSPACE)\n", found_signature);
    return found;
}

static bool sync_keys(int fd, struct selection *selection)
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
    if (ioctl(fd, EVIOCGKEY(sizeof(keys)), keys) < 0)
        return false;
    selection->enter_down = bit(keys, KEY_ENTER);
    return true;
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

static int input_event(int fd, const struct prompt *prompt, struct selection *selection,
                       const struct input_event *event, int64_t now, bool probe)
{
    if (event->type == EV_SYN && event->code == SYN_DROPPED) {
        selection->dropped = true;
        selection->armed = false;
        selection->enter_started = false;
    } else if (selection->dropped) {
        if (event->type == EV_SYN && event->code == SYN_REPORT) {
            if (!sync_keys(fd, selection))
                return DISMISS;
            selection->dropped = false;
        }
    } else if (event->type == EV_REL && event->code == REL_HWHEEL) {
        if (probe)
            fprintf(stderr, "Commander: REL_HWHEEL %d\n", event->value);
        rotate(prompt, selection, (int64_t)event->value * prompt->polarity, now);
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
        if (!on_parent_exit(SIGKILL, parent))
            _exit(127);
        execv(prompt->dialog, args);
        _exit(127);
    }
done:
    for (int i = 0; i < prompt->count + 2; ++i)
        free(args[i + 2]);
    return child;
}

/* Only a normal exit from this child can be a touch choice. A signal used for a redraw cannot be a choice. */
static int reap_dialog(pid_t *child, int count, bool redraw)
{
    int status;
    if (*child <= 0)
        return RUNNING;
    if (redraw)
        kill(*child, SIGKILL);
    pid_t waited;
    do {
        waited = waitpid(*child, &status, redraw ? 0 : WNOHANG);
    } while (waited < 0 && errno == EINTR);
    if (!waited)
        return RUNNING;
    *child = -1;
    if (waited > 0 && WIFEXITED(status) && WEXITSTATUS(status) < count)
        return WEXITSTATUS(status);
    if (redraw && waited > 0 && WIFSIGNALED(status) && WTERMSIG(status) == SIGKILL)
        return RUNNING;
    return DIALOG_FAILED;
}

static int run_prompt(const struct prompt *prompt, const struct media *media, int fd, bool probe)
{
    struct selection selection = {.focus = -1, .shown = -1};
    for (int i = 0; i < prompt->count; ++i) {
        if (!strcmp(prompt->labels[prompt->order[i] - '0'], "CANCEL"))
            selection.focus = i;
    }
    if (!sync_keys(fd, &selection))
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
    struct pollfd input = {.fd = fd, .events = POLLIN};
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
        int ready = poll(&input, 1, POLL_MS);
        if (ready < 0 && errno == EINTR)
            continue;
        if (ready < 0 || (input.revents & (POLLERR | POLLHUP | POLLNVAL)))
            break;
        if (!ready) {
            if (!selection.dropped && selection.focus == selection.shown && now_ms() >= selection.arm_at)
                selection.armed = true;
            continue;
        }
        struct input_event events[32];
        ssize_t bytes = read(fd, events, sizeof(events));
        if (bytes < 0 && (errno == EINTR || errno == EAGAIN))
            continue;
        if (bytes <= 0 || (size_t)bytes % sizeof(events[0]))
            break;
        for (size_t i = 0; i < (size_t)bytes / sizeof(events[0]); ++i) {
            int pressed = input_event(fd, prompt, &selection, &events[i], now_ms(), probe);
            if (pressed == RUNNING)
                continue;
            touch = reap_dialog(&child, prompt->count, false);
            result = pressed;
            if (pressed != DISMISS && touch != RUNNING)
                result = touch;
            goto done;
        }
    }
done:
    reap_dialog(&child, prompt->count, true);
    /* A child exit, input disconnect and deadline can all become ready in one poll. */
    now = now_ms();
    if (result == DISMISS || interrupted || now < 0 || now >= deadline || !media_present(media))
        return DISMISS;
    if (poll(&input, 1, 0) < 0 || (input.revents & (POLLERR | POLLHUP | POLLNVAL)))
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
    /* dialog marker input-signature polarity order title text ok cancel [third] */
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
    int fd = open_input(argv[3]);
    if (fd < 0)
        return UNAVAILABLE;
    int result = run_prompt(&prompt, &media, fd, !strcmp(argv[3], "-"));
    close(fd);
    return result;
}
