/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Toolkit to deal with Session Description Protocol (SDP),
 * mainly to tranform a SDP string Offer/Answer to a manipulable JS object representation
 * @example
 * const peerConnection = new RTCPeerConnection();
 * peerConnection.createOffer()
 * .then( offer =>
 *    // Change offer.sdp string to a JS manipulable object
 *    const sdp = SDP.fromString(offer.sdp || '');
 *    // Change a property of SDP
 *    sdp.v = 2; // change SDP version
 *    // Reserialize to the legal SDP string format
 *    offer.sdp = SDP.toString(sdp);
 *    // Set SDP offer to peerConnection
 *    peerConnection.setLocalDescription(offer);
 * )
 */
export const SDP = {
    /**
     * Unserialize SDP string to a manipulable JS object representation
     * It's an object with:
     *  - root SDP properties
     *  - media description iterable
     * @param lines SDP string reprensentation
     * @returns SDP object representation, iterable through media description
     * @example
     * [
     *    group: "DUNBLE 0 1",
     *    o: "- 1699450751193623 0 IN IP4 0.0.0.0",
     *    s: "-",
     *    t: "0 0",
     *    v: "0",
     *    ice-lite: "",
     *    length: 2,
     *    {
     *       m: "audio 9 UDP/TLS/RTP/SAVPF 111",
     *       c: "IN IP4 0.0.0.0",
     *       rtcp: "9",
     *       sendonly: "",
     *       setup: "passive",
     *       fingerprint: "sha-256 51:36:ED:78:A4:9F:25:8C:39:9A:0E:A0:B4:9B:6E:04:37:FF:AD:96:93:71:43:88:2C:0B:0F:AB:6F:9A:52:B8",
     *       ice-ufrag: "fa37",
     *       ice-pwd: "JncCHryDsbzayy4cBWDxS2",
     *       rtcp-mux: "",
     *       rtcp-rsize: "",
     *       rtpmap: "111 opus/48000/2",
     *       rtcp-fb: "111 nack",
     *       id: "0",
     *       fmtp: "111 minptime=10;useinbandfec=1",
     *       candidate: "1 1 udp 2130706431 89.105.221.108 56643 typ host",
     *       end-of-candidates: ""
     *    },
     *    {
     *       m: "video 9 UDP/TLS/RTP/SAVPF 106",
     *       c: "IN IP4 0.0.0.0",
     *       rtcp: "9",
     *       sendonly: "",
     *       setup: "passive",
     *       fingerprint: "sha-256 51:36:ED:78:A4:9F:25:8C:39:9A:0E:A0:B4:9B:6E:04:37:FF:AD:96:93:71:43:88:2C:0B:0F:AB:6F:9A:52:B8",
     *       ice-ufrag: "fa37",
     *       ice-pwd: "JncCHryDsbzayy4cBWDxS2",
     *       rtcp-mux: "",
     *       rtcp-rsize: "",
     *       rtpmap: "106 H264/90000",
     *       rtcp-fb: [
     *          "106 nack",
     *          "106 goog-remb"
     *       ],
     *       mid: "1",
     *       fmtp: "106 profile-level-id=42e01f;level-asymmetry-allowed=1;packetization-mode=1",
     *       candidate: "1 1 udp 2130706431 89.105.221.108 56643 typ host",
     *       end-of-candidates: ""
     *    }
     * ]
     */
    fromString(lines: string): any {
        if (Array.isArray(lines)) {
            return lines; // already converted
        }
        const sdp = new Array<any>();
        let media: any = sdp;
        let fingerprint;
        for (let line of lines.toString().split('\n')) {
            line = line.trim();
            if (!line) {
                continue;
            }

            let key = line[0];
            const value = line.substring(line.indexOf('=') + 1).trim();
            switch (key.toLowerCase()) {
                case 'a': {
                    if (!value) {
                        continue;
                    } // empty attribute!
                    key = this.addAttribute(media, value);
                    // save fingerprint to repeat it in medias
                    if (sdp === media && key.toLowerCase() === 'fingerprint') {
                        fingerprint = media.fingerprint;
                    }
                    break;
                }
                case 'm':
                    if (sdp.length && fingerprint && !sdp[sdp.length - 1].fingerprint) {
                        media.fingerprint = fingerprint;
                    }
                    sdp.push((media = { m: value }));
                    break;
                default:
                    media[key] = value;
            }
        }
        if (sdp.length && fingerprint && !sdp[sdp.length - 1].fingerprint) {
            media.fingerprint = fingerprint;
        }
        return sdp;
    },

    /**
     * Serialize SDP JS object to a SDP string legal representation
     * @param sdp SDP object reprensetation
     * @returns SDP string reprensentation
     */
    toString(sdp: any): string {
        if (typeof sdp === 'string') {
            return sdp; // already converted
        }
        const medias = [];
        // https://www.cl.cam.ac.uk/~jac22/books/mm/book/node182.html
        let lines = 'v' in sdp ? 'v=' + sdp.v + '\n' : '';
        if ('o' in sdp) {
            lines += 'o=' + sdp.o + '\n';
        }
        if ('s' in sdp) {
            lines += 's=' + sdp.s + '\n';
        }
        const obj: any = sdp;
        for (const key of Object.keys(sdp)) {
            if (key === 'v' || key === 'o' || key === 's') {
                continue;
            }
            const value = obj[key];
            if (value == null) {
                continue;
            } // ignore this key/value
            const index = parseInt(key);
            if (!isNaN(index)) {
                // Is a number! Media object!
                medias[index] = value;
                continue;
            }
            const count = (Array.isArray(value) && value.length) || 1; // value can be numeric!
            for (let i = 0; i < count; ++i) {
                const line = Array.isArray(value) && value.length ? value[i] : value;
                if (key.length > 1) {
                    // when key is superior to 1 letter it's a attribute!
                    lines += 'a=' + key;
                    if (line) {
                        lines += ':';
                    }
                } else {
                    lines += key + '=';
                }
                lines += line + '\n';
            }
        }
        for (const media of medias) {
            lines += this.toString(media);
        }
        return lines;
    },

    /**
     * While set a property to a SDP object representation is possible directly,
     * we could prefer add a new property without overload a possible already existing value.
     * This function allows to add a property to our SDP representation:
     *  - if the key's attribute doesn't exists yet it adds it like a simple JS property sdp[key] = value
     *  - if the key's attribute exists already it morphs the value to a Array and push it inside
     * @param sdp the SDP object representation on which added the attribute
     * @param attribute the string attribut in a format "key:value" or just "key" to add an attribute without value
     * @returns the key part of the attribute added (or if value is empty it returns the same attribute as passed in argument)
     */
    addAttribute(sdp: object, attribute: string): string {
        const a = SDP.parseAttribute(attribute);
        const value = a.value ?? ''; // to allow to test if key exists even without value with if(sdp.key != null)
        const obj: any = sdp;
        const oldValue = obj[a.key];
        if (!oldValue) {
            obj[a.key] = value;
        } else if (Array.isArray(oldValue)) {
            oldValue.push(value);
        } else if (value !== oldValue) {
            obj[a.key] = [oldValue, value];
        }
        return a.key;
    },

    /**
     * While it's possible to delete a attribute manually on the SDP object representation with a delete sdp.key,
     * we could prefer remove only a value in a sdp.key array containing multiple values.
     * Like opposite to addAttribute this method allows to remove an unique attribute value.
     * @param sdp the SDP object representation on which removed the attribute
     * @param attribute the string attribut in a format "key:value" or just "key" to remove the whole attribute and all its values
     * @returns the key part of the attribute removed (or if value is empty it returns the same attribute as passed in argument)
     */
    removeAttribute(sdp: object, attribute: string): string {
        const a = SDP.parseAttribute(attribute);
        const obj: any = sdp;
        if (a.value === undefined) {
            delete obj[attribute];
            return attribute;
        }
        const current = obj[attribute];
        if (Array.isArray(a.value)) {
            const i = current.findIndex((current: string) => current === a.value);
            if (i >= 0) {
                current.splice(i, 1);
            }
        } else if (current === a.value) {
            delete obj[attribute];
        }
        return a.key;
    },

    /**
     * Parse an attribute in a format "key:value"
     * @param attribute string attribute to parse
     * @returns the {key, value} result, with value undefined if attribute was a "key" without value
     */
    parseAttribute(attribute: string): { key: string; value: string | undefined } {
        const found = attribute.indexOf(':');
        return {
            key: (found >= 0 ? attribute.substring(0, found) : attribute).trim(),
            value: found >= 0 ? attribute.substring(found + 1).trim() : undefined
        };
    }
};
Object.freeze(SDP);
