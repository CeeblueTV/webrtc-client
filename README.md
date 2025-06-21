[Requirements](#requirements) | [Usage](#usage) | [Examples](#examples) | [Building locally](#building-locally) | [Documentation](#documentation) | [Contribution](#contribution) | [License](#license)

# Ceeblue WebRTC Client
[![npm](https://img.shields.io/npm/v/%40ceeblue%2Fwebrtc-client)](https://npmjs.org/package/@ceeblue/webrtc-client)

The Ceeblue WebRTC Client is a generic client library designed to simplify the implementation of WebRTC functionalities for Ceeblue customers.

The client library addresses common challenges faced by developers:
- **Unified Browser Support** - Addresses inconsistencies and variations in implementation across different browsers.
- **Firewall Traversal** - Implements TURN to manage firewall traversal.
- **Security** - Ensures secure streaming through encryption and authentication.
- **Quality of Service (QoS)** - Handles latency, packet loss, and other optimizations.
- **Signaling** - Unifies different signaling capabilities over WebSocket and WHIP/WHEP into a single, easy-to-use interface, with enhanced communication robustness.
- **Multi Bitrate Playback** - Enables the player to switch in real-time between multiple quality renditions based on network conditions and client capabilities.
- **Adaptive Bitrate Streaming** - Allows the streamer to adapt its video bitrate in real-time based on network conditions and client capabilities.

> [!CAUTION]
>
> Using TURN ensures near-universal connectivity, but introduces important tradeoffs:
> - Relaying adds latency.
> - TURN over TCP/TLS doesn’t handle congested networks well, video can freeze or slow down.
> 
> Use TURN wisely, it should be your last resort.

## Requirements

| Item | Description |
| --- | --- |
| **Ceeblue Account** | To create a Stream, you will need an account with [Ceeblue Streaming Cloud](https://dashboard.ceeblue.tv). A trial account is sufficient. If you do not have one yet, you can request one on the [Ceeblue website](https://ceeblue.net/free-trial/). |
| **Stream** | To use this library, you'll first need to create a stream either through [Ceeblue Cloud API](https://docs.ceeblue.net/reference) or on [the dashboard](https://dashboard.ceeblue.tv). Use the [Quick Start Guide](https://docs.ceeblue.net/reference/quick-start-guide) for fast results. |
| **Node Package Manager (npm)** | Download and install from https://nodejs.org/en/download |

> [!IMPORTANT]
> 
> The `<endPoint>` and `<streamName>` (UUID) variables are part of the URL used to access the stream, which will be provided by Ceeblue either via the [API](https://docs.ceeblue.net/reference) or the [dashboard](https://dashboard.ceeblue.tv).\
> These variables are required for publishing or playing a stream. The WebRTC signaling URL format is as follows:
>
> ```
> [wss|https]://<endPoint>/webrtc/<streamName>
> ```
>
> The `<endPoint>` is the host part of this URL, and `<streamName>` is the unique identifier for your stream.\
> The signaling protocol can be either `wss` (WebSocket Secure) or `https` (for WHIP/WHEP).\
> We **recommend** using `wss` for WebRTC because it unlocks additional features, such as adaptive bitrate (ABR).

## Usage

Add the library as a dependency to your project using:
```
npm install @ceeblue/webrtc-client
```
[Import](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) the library into your project with:
 ```javascript
import * as WebRTC from '@ceeblue/webrtc-client';
```

> [!TIP]
> 
> If your project uses TypeScript, it is recommended that you set the "target" property in your configuration to "ES6". This will align with our usage of ES6 features and ensure that your build succeeds.\
> If you require a backwards-compatible [UMD](https://github.com/umdjs/umd) version, we recommend [building it locally](#building-locally).
> 
> Set `"moduleResolution": "Node"` in **tsconfig.json** to ensure TypeScript resolves imports correctly for Node.js.
> 
> ```json
> {
>    "compilerOptions": {
>       "target": "ES6",
>       "moduleResolution": "Node"
>    }
> }
> ```

### Publish a stream

To publish a stream, use the [Streamer](./src/Streamer.ts) class.\
Use the `<endPoint>` and `<streamName>` you received from the [Ceeblue Cloud API](https://docs.ceeblue.net/reference/post-inputs) or Dashboard.\
For a full example, see streamer.html in [Examples](#examples).

```javascript
import { Streamer } from '@ceeblue/webrtc-client';

const streamer = new Streamer();
streamer.onStart = stream => {
   console.log('start streaming');
}
streamer.onStop = _ => {
   console.log('stop streaming');
}
const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
streamer.start(stream, {
   endPoint: <endPoint>,
   streamName: <streamName>,
   iceServer: {
      urls: ['turn:' + <endPoint> + ':3478?transport=tcp', 'turn:' + <endPoint> + ':3478'],
      username: 'ceeblue', credential: 'ceeblue'
   }
});
```
> [!IMPORTANT]
>
> Given this URL: `wss://example.com/webrtc/in+aa3221a5-a715-4215-9e9d-711f2c9cfc45`\
> **You can set:**
> - `<endPoint> = example.com` and `<streamName> = in+aa3221a5-a715-4215-9e9d-711f2c9cfc45`, or
> - `<endPoint> = wss://example.com/webrtc/in+aa3221a5-a715-4215-9e9d-711f2c9cfc45` (no separate `<streamName>` needed)

### Play a stream

To play the stream, use the [Player](./src/Player.ts) class.\
Use the `<endPoint>` and `<streamName>` you received from the [Ceeblue Cloud API](https://docs.ceeblue.net/reference/post-outputs) or Dashboard.\
For a full example, see player.html in [Examples](#examples).

```javascript
import { Player } from '@ceeblue/webrtc-client';

const player = new Player();

player.onStart = stream => {
   videoElement.srcObject = stream;
   console.log('start playing');
}
player.onStop = _ => {
   console.log('stop playing');
}
player.start({
   endPoint: <endPoint>,
   streamName: <streamName>,
   iceServer: {
      urls: ['turn:' + <endPoint> + ':3478?transport=tcp', 'turn:' + <endPoint> + ':3478'],
      username: 'ceeblue', credential: 'ceeblue'
   }
});
```

> [!IMPORTANT]
> 
> When specifying your stream connection `<endPoint>` can be either:
> - The **hostname** (e.g. example.com), or
> - The **full URL** (e.g. wss://example.com/webrtc/out+aa3221a5-a715-4215-9e9d-711f2c9cfc45)
> 
> If you provide the **full URL** as `<endPoint>`, the library will automatically extract the `<streamName>` for you, no need to specify it separately.\
> If you provide only the **hostname**, you must also specify the `<streamName>`. If you don’t, the connection will fail because we won’t know which stream to connect to. 
> 
> For full details on the available connection parameters, check out the Params type in [`Connect.ts` file from `web-utils`](https://github.com/CeeblueTV/web-utils/blob/main/src/Connect.ts).

## Examples

To help you understand how to use the library, we've created three examples:

- [/examples/streamer.html](./examples/streamer.html) Publish a stream with your webcam
- [/examples/player.html](./examples/player.html) Play a stream
- [/examples/player-with-timed-metadata.html](./examples/player-with-timed-metadata.html) Play a stream with timed metadata (Advanced; requires a stream with timecode)

1. In your project folder, open Terminal and type this command to start a HTTP server locally:

    ```console
    npx http-server . -p 8081
    ```

2. Open the following address in your browser, replacing any placeholders in the URL with the variables from the [Ceeblue Cloud API](https://docs.ceeblue.net/reference/post-inputs) or Dashboard.

   ```html
   http://localhost:8081/examples/streamer.html?host=<endPoint>&stream=<streamName>
   ```

3. Click on **Start streaming**.\
   The live stream from your webcam will start.\
   If your browser asks for permission to access your camera, make sure you grant it.

4. Open a separate browser window and enter the following address into the address bar, replacing any placeholders in the URL with the variables from the [Ceeblue Cloud API](https://docs.ceeblue.net/reference/post-outputs) or Dashboard.

   ```html
   http://localhost:8081/examples/player.html?host=<endPoint>&stream=<streamName>
   ```

5. Click **Play** to start watching the live stream.

## Building locally

```console
git clone https://github.com/CeeblueTV/webrtc-client.git
cd webrtc-client
npm install
npm run build
```
1. [Clone](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository) this repository.
2. Enter the `webrtc-client` folder.
3. Run `npm install` to install packages dependencies.
4. Execute `npm run build`.

The following files will be created and placed in the **/dist/** folder:
- **webrtc-client.d.ts:** Typescript definitions
- **NPM binaries**
  - **webrtc-client.js:** NPM JavaScript library
  - **webrtc-client.js.map:** Source map that associates the NPM library with the original source files
  - **webrtc-client.min.js:** Minified version of the NPM library, optimized for size
  - **webrtc-client.min.js.map:** Source map that associates the NPM minified library with the original source files
- **Browser binaries**
  - **webrtc-client.bundle.js:** Browser JavaScript library
  - **webrtc-client.bundle.js.map:** Source map that associates the browser library with the original source files
  - **webrtc-client.bundle.min.js:** Minified version of the browser library, optimized for size
  - **webrtc-client.bundle.min.js.map:** Source map that associates the browser minified library with the original source files

> [!TIP]
>
> The project uses ES modules by default.\
> However, you can build it for other supported module systems (CommonJS or IIFE) using the following commands:
> ```console
> npm run build:cjs
> npm run build:iife
> ```
>  
> The default target is ES6.\
> If you want to manually test other targets (although they are not officially supported), you can experiment with:
> ```console
> npm run build -- --target esnext
> npm run build:cjs -- --target esnext
> ```
>
> Run the watch command to automatically rebuild the bundles whenever changes are made:
> ```console
> npm run watch
> ```
> If you prefer to watch and build for a specific target, use one of these commands:
> ```console
> npm run watch:cjs
> npm run watch:iife
> ```

## Documentation

This monorepo contains built-in API documentation, which can be generated using the following npm command:
```console
npm run build:docs
```
Once generated, open `./docs/index.html` to view the documentation.\
Alternatively, start the http-server and navigate to localhost:
```console
npx http-server . -p 8081
http://localhost:8081/docs/
```

## Contribution

All contributions are welcome. Please see [our contribution guide](/CONTRIBUTING.md) for details.

## License

By contributing code to this project, you agree to license your contribution under the [GNU Affero General Public License](/LICENSE).
