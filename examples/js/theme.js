/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

// Applies the stored theme before the first paint, to avoid a flash of the wrong one.
// Classic script on purpose: a `type="module"` one is deferred and would paint first.
// Same key as the wrts-client examples, so the theme follows from one page to the next.
(function () {
    var stored = localStorage.getItem('wrts-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = stored === 'dark' ? 'dark' : 'light';
})();
