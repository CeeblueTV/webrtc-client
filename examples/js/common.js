/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

// Pieces shared by player.html and streamer.html. Everything here drives the chrome around
// the video (theme, overlay controls, error banner, layout, metrics export) and never
// touches a Player or a Streamer.
//
// The webrtc-client URL must resolve to the one the pages import, so the browser hands out
// the same module instance (a second copy would mean a `log` whose level the page never set).
import { utils } from '../../dist/webrtc-client.bundle.js';

const { Util, log } = utils;

const THEME_KEY = 'wrts-theme';
const THEME_CYCLE = ['light', 'dark'];

/**
 * Theme selector: `theme` state, the header button's icon/tooltip, and a live follow of
 * the OS setting. The initial paint is done by js/theme.js, before this ever runs.
 */
export const themeMixin = {
    data() {
        return {
            theme: localStorage.getItem(THEME_KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        };
    },
    mounted() {
        // An OS theme change overrides the stored choice
        this._themeQuery = matchMedia('(prefers-color-scheme: dark)');
        this._themeListener = e => {
            this.theme = e.matches ? 'dark' : 'light';
            localStorage.removeItem(THEME_KEY);
            this.applyTheme();
        };
        this._themeQuery.addEventListener('change', this._themeListener);
    },
    beforeUnmount() {
        this._themeQuery?.removeEventListener('change', this._themeListener);
    },
    methods: {
        cycleTheme() {
            this.theme = THEME_CYCLE[(THEME_CYCLE.indexOf(this.theme) + 1) % THEME_CYCLE.length];
            localStorage.setItem(THEME_KEY, this.theme);
            this.applyTheme();
        },
        applyTheme() {
            document.documentElement.dataset.theme = this.theme === 'dark' ? 'dark' : 'light';
        },
        themeIcon() {
            return { light: 'fa-sun', dark: 'fa-moon' }[this.theme];
        },
        themeTooltip() {
            return `Theme: ${this.theme} (click to cycle)`;
        }
    }
};

/**
 * Side-by-side layout toggle: docks the graph panel to the right of the video instead of
 * below it. Only flags <html>, the CSS gates the split on wide screens.
 * A page that persists its state in the URL just has to expose an `updateURL()`.
 */
export const sidePanelMixin = {
    data() {
        return { sidePanel: true };
    },
    mounted() {
        // The watcher below only fires on a change, apply whatever the page defaulted to.
        document.documentElement.classList.toggle('layout-side', this.sidePanel);
    },
    watch: {
        sidePanel(value) {
            document.documentElement.classList.toggle('layout-side', value);
        }
    },
    methods: {
        toggleSidePanel() {
            this.sidePanel = !this.sidePanel;
            this.updateURL?.();
        }
    }
};

/**
 * Hover/touch revealed overlay controls (fullscreen / stop) on the `.player` box.
 * Expects a `player` ref on the box, a `video` ref inside it, and an `overlayActive()`
 * method telling when the controls may show.
 */
export const overlayMixin = {
    data() {
        return {
            controlsVisible: false,
            isFullscreen: false
        };
    },
    mounted() {
        // Track fullscreen state so the overlay button can flip between expand/compress icons.
        // iOS Safari uses native video fullscreen (webkit*fullscreen events on the video).
        this._fsListener = () => {
            this.isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
        };
        document.addEventListener('fullscreenchange', this._fsListener);
        document.addEventListener('webkitfullscreenchange', this._fsListener);
        this.$refs.video.addEventListener('webkitbeginfullscreen', () => {
            this.isFullscreen = true;
        });
        this.$refs.video.addEventListener('webkitendfullscreen', () => {
            this.isFullscreen = false;
        });
    },
    beforeUnmount() {
        document.removeEventListener('fullscreenchange', this._fsListener);
        document.removeEventListener('webkitfullscreenchange', this._fsListener);
        clearTimeout(this._controlsTimer);
    },
    methods: {
        onPlayerActivity() {
            if (this.overlayActive()) {
                this.showControls();
            }
        },
        onPlayerLeave() {
            this.hideControls();
        },
        onPlayerTouch(event) {
            if (!this.overlayActive()) {
                return;
            }
            // Treat the touch as button-targeted only when controls are *already* visible —
            // otherwise the user can't see the button, so any tap there must just mean "reveal".
            if (this.controlsVisible && event.target.closest('.pc-btn')) {
                // Let the synthetic click reach the button; just refresh the auto-hide timer.
                this.showControls();
                return;
            }
            // Suppress the synthetic click so a single tap can't hit a button that wasn't visible yet
            event.preventDefault();
            if (this.controlsVisible) {
                this.hideControls();
            } else {
                this.showControls();
            }
        },
        onPlayerContextMenu(event) {
            // Long-press on touch devices fires a contextmenu: reveal the controls instead.
            if (this.overlayActive()) {
                event.preventDefault();
                this.showControls();
            }
        },
        showControls() {
            this.controlsVisible = true;
            clearTimeout(this._controlsTimer);
            this._controlsTimer = setTimeout(() => {
                this.controlsVisible = false;
            }, 3000);
        },
        hideControls() {
            clearTimeout(this._controlsTimer);
            this.controlsVisible = false;
        },
        fullscreen() {
            const video = this.$refs.video;
            const target = this.$refs.player; // fullscreen the container so our overlay stays reachable

            // Already in fullscreen → exit. Prefer the standard exit path.
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                (document.exitFullscreen || document.webkitExitFullscreen).call(document);
                return;
            }
            // iOS Safari can only fullscreen the <video> itself (native player UI exits via "Done").
            if (video.webkitDisplayingFullscreen) {
                video.webkitExitFullscreen?.();
                return;
            }
            if (target.requestFullscreen) {
                target.requestFullscreen();
            } else if (target.webkitRequestFullscreen) {
                target.webkitRequestFullscreen();
            } else {
                video.webkitEnterFullscreen?.();
            }
        }
    }
};

/**
 * Metrics chart plumbing: the `stats` series feeding UIMetrics, their CSV export, and the
 * generic file download. Each page keeps its own sampling loop and `resetMetrics()`.
 */
export const metricsMixin = {
    data() {
        return {
            // Display label => array of samples, one per poll. Values are strings with their
            // unit ('850kbps'), UIMetrics parses the number out and keeps the unit as a suffix.
            stats: new Map(),
            // Local and media time of each sample, the first two columns of the CSV export
            times: [],
            hasMetrics: false,
            uiStats: null,
            deltaStats: {}
        };
    },
    methods: {
        download(name, data, type) {
            const url = URL.createObjectURL(new Blob([data], { type }));
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', name);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        },
        downloadStats() {
            let max = this.times.length;
            const headers = ['localTime', 'mediaTime'];
            for (const [header, values] of this.stats) {
                headers.push(header);
                max = Math.max(max, values.length);
            }
            let csv = headers.join(';');

            // Series are filled independently (a metric can start late), so a row can be short
            for (let i = 0; i < max; ++i) {
                csv += '\n';
                const { time, mediaTime } = this.times[i] ?? {};
                csv += (time || '') + ';' + (mediaTime || '') + ';';
                for (const [, values] of this.stats) {
                    csv += (values[i] == null ? '' : parseFloat(values[i])) + ';';
                }
            }

            this.download('stats.csv', csv, 'text/csv;charset=utf-8;');
        },
        // Drop the samples the chart no longer displays, or all of them when `all` is set
        // (a new stream: the previous run's scale would flatten the new one).
        trimStats(all = false) {
            const displayableCount = all ? 0 : this.uiStats.displayableCount;
            for (const [, values] of this.stats) {
                values.splice(0, Math.max(0, values.length - displayableCount));
            }
            this.times.splice(0, Math.max(0, this.times.length - displayableCount));
        }
    }
};

/**
 * Phone-sized viewport (portrait or landscape), where the settings eat the room of the graph.
 *
 * @returns {boolean}
 */
export function isSmallScreen() {
    return matchMedia('(max-width: 680px), (max-height: 500px)').matches;
}

/**
 * Sets, or removes when empty, a query parameter, dropping the case variants
 * `Util.caseInsensitive(Util.options())` accepts so the URL keeps one of each.
 * `true` sets a flag without value.
 *
 * @param {URL} url
 * @param {string} name
 * @param {string|boolean|undefined} value
 */
export function setURLParam(url, name, value) {
    for (const key of [...url.searchParams.keys()]) {
        if (key.toLowerCase() === name.toLowerCase()) {
            url.searchParams.delete(key);
        }
    }
    if (value) {
        url.searchParams.set(name, value === true ? '' : value);
    }
}

/**
 * Shows `url` in the address bar without adding a history entry. Flags are written
 * without `=` (`?sidePanel&whep` rather than `?sidePanel=&whep=`).
 *
 * @param {URL} url
 */
export function replaceURL(url) {
    // ':' and '/' are valid in a query, keep them readable (endPoint=wss://host)
    const encode = value => encodeURIComponent(value).replace(/%3A/gi, ':').replace(/%2F/gi, '/');
    const query = [];
    for (const [name, value] of url.searchParams) {
        query.push(encode(name) + (value ? '=' + encode(value) : ''));
    }
    url.search = query.join('&');
    if (url.href !== location.href) {
        history.replaceState(null, '', url);
    }
}

// Keys the .player-alert renders itself, everything else on the error object becomes a chip.
const ALERT_RESERVED_KEYS = new Set(['type', 'name', 'detail']);

/**
 * Normalizes any error shape (a Player/Streamer onStop union member, a getUserMedia
 * DOMException, an input-validation error) into what .player-alert renders:
 * `{ type, name, detail, fields: [{ label, value }] }`. Unknown own-properties become
 * key/value chips, so subsystem context stays visible without a UI variant per error type.
 *
 * @param {object|null} error
 * @returns {object|null}
 */
export function normalizeError(error) {
    if (!error) {
        return null;
    }
    const fields = [];
    for (const key of Object.keys(error)) {
        if (ALERT_RESERVED_KEYS.has(key)) {
            continue;
        }
        const value = error[key];
        if (value == null || value === '') {
            continue;
        }
        let display;
        if (typeof value === 'object') {
            // JSON rather than String(), which would render '[object Object]'
            try {
                display = JSON.stringify(value);
            } catch {
                display = String(value);
            }
        } else {
            display = String(value);
        }
        fields.push({ label: key, value: display });
    }
    return {
        // Strip the redundant 'Error' suffix from union discriminants, so the badge
        // reads 'CONNECTOR' rather than 'CONNECTORERROR'.
        type: (error.type || '').replace(/Error$/, '') || null,
        name: error.name || 'Unknown error',
        detail: error.detail || null,
        fields
    };
}

/**
 * Builds a fixed, collapsible on-screen panel mirroring every `log()` line (newest at the
 * end), so logs can be read and copied on a device with no working chrome://inspect.
 * Hooks `log.on` non-destructively, the default console output still runs.
 * Enabled by the `?debugoverlay` query parameter.
 */
export function setupDebugOverlay() {
    const PANEL_VH = 40; // expanded height
    const MAX_ROWS = 500; // cap retained rows to avoid unbounded DOM/memory growth
    // Container: header bar (always visible) + scrollable log box.
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:rgba(0,0,0,.85);font:11px/1.35 monospace;';
    const header = document.createElement('div');
    header.style.cssText =
        'display:flex;gap:8px;align-items:center;padding:3px 6px;' +
        'background:#111;color:#ccc;border-top:1px solid #333;cursor:pointer;user-select:none';
    const title = document.createElement('span');
    title.textContent = '▾ debug logs';
    title.style.flex = '1';
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'copy';
    copyBtn.style.cssText = 'font:11px monospace';
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'clear';
    clearBtn.style.cssText = 'font:11px monospace';
    const box = document.createElement('div');
    box.style.cssText =
        'overflow:auto;color:#9f9;padding:4px 6px;white-space:pre-wrap;word-break:break-word;' + 'height:' + PANEL_VH + 'vh';
    header.append(title, copyBtn, clearBtn);
    panel.append(header, box);

    let collapsed = false;
    const apply = () => {
        box.style.display = collapsed ? 'none' : 'block';
        title.textContent = (collapsed ? '▸' : '▾') + ' debug logs';
        // Reserve page space so the panel never permanently hides page content
        // (e.g. the bottom of the metrics graph). Collapsed → just the header bar.
        document.body.style.paddingBottom = collapsed ? '26px' : 'calc(' + PANEL_VH + 'vh + 26px)';
    };
    header.onclick = e => {
        if (e.target === clearBtn || e.target === copyBtn) {
            return;
        }
        collapsed = !collapsed;
        apply();
    };
    clearBtn.onclick = () => {
        box.textContent = '';
    };
    copyBtn.onclick = () => {
        // Rows are oldest-on-top (chronological), copy as-is.
        const text = Array.from(box.children)
            .map(r => r.textContent)
            .join('\n');
        const done = ok => {
            copyBtn.textContent = ok ? 'copied!' : 'copy failed';
            setTimeout(() => {
                copyBtn.textContent = 'copy';
            }, 1500);
        };
        // navigator.clipboard needs a secure context (https/localhost); fall back to
        // a temporary textarea + execCommand for plain-http LAN access from the phone.
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(
                () => done(true),
                () => done(false)
            );
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            let ok = false;
            try {
                ok = document.execCommand('copy');
            } catch {}
            document.body.removeChild(ta);
            done(ok);
        }
    };

    const ready = () => {
        document.body.appendChild(panel);
        apply();
    };
    document.readyState === 'loading' ? addEventListener('DOMContentLoaded', ready) : ready();
    log.on = (level, args) => {
        const line = args.map(a => (typeof a === 'object' && a !== null ? Util.stringify(a) : String(a))).join(' ');
        const row = document.createElement('div');
        row.style.color = level === 'error' ? '#f55' : level === 'warn' ? '#fd5' : '#9f9';
        const d = new Date();
        const ts =
            String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0') + ':' +
            String(d.getSeconds()).padStart(2, '0') + '.' +
            String(d.getMilliseconds()).padStart(3, '0');
        row.textContent = `${ts} [${level}] ${line}`;
        // Stick to the end only when the user is already at the bottom and isn't
        // selecting text inside the box (so manual scroll-up / text selection is preserved).
        const slack = 4; // px tolerance for "at bottom"
        const wasAtBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - slack;
        const selection = window.getSelection();
        const selecting = selection && !selection.isCollapsed && box.contains(selection.anchorNode);
        box.appendChild(row); // newest at the end
        // Trim oldest rows (top) to keep DOM/memory bounded on long sessions
        while (box.childElementCount > MAX_ROWS) {
            box.removeChild(box.firstChild);
        }
        if (wasAtBottom && !selecting) {
            box.scrollTop = box.scrollHeight;
        }
    };
}

// Raw <video> media events worth logging when diagnosing a freeze. 'timeupdate' is left out
// (too noisy), and so are 'durationchange'/'progress'.
const MEDIA_EVENTS = [
    'play', 'playing', 'pause', 'waiting', 'stalled', 'suspend', 'emptied', 'ended',
    'seeking', 'seeked', 'ratechange', 'canplay', 'canplaythrough', 'loadeddata', 'loadedmetadata'
];

/**
 * Logs the raw media events of a <video> element. Enabled by the `?events` query parameter.
 *
 * @param {HTMLVideoElement} video
 */
export function logMediaEvents(video) {
    for (const name of MEDIA_EVENTS) {
        video.addEventListener(name, () =>
            log(
                '[event]',
                name,
                't=' + video.currentTime.toFixed(3),
                'paused=' + video.paused,
                'readyState=' + video.readyState,
                'rate=' + video.playbackRate
            ).info()
        );
    }
}
