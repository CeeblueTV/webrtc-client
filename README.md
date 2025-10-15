[Requirements](#requirements) | [Usage](#usage) | [Examples](#examples) | [Building locally](#building-locally) | [Logs](#logs) | [Documentation](#documentation) | [Contribution](#contribution) | [License](#license)


# Ceeblue WebRTC Client
[![npm](https://img.shields.io/npm/v/%40ceeblue%2Fwebrtc-client)](https://npmjs.org/package/@ceeblue/webrtc-client)

The Ceeblue WebRTC Client is a generic client library designed to simplify the implementation of WebRTC functionalities for Ceeblue customers.

The client library addresses common challenges faced by developers:
- **Unified Browser Support** - Addresses inconsistencies and variations in implementation across different browsers.
- **Firewall Traversal** - Implements TURN to manage firewall traversal.
- **Security** - Ensures secure streaming through encryption and authentication.
- **Quality of Service (QoS)** - Handles latency, packet loss, and other optimizations.
- **Signaling** - Unifies different signaling capabilities over WebSocket and [WHIP]/[WHEP] into a single, easy-to-use interface, with enhanced communication robustness.
- **Multi Bitrate Playback** - Enables the player to switch in real-time between multiple quality renditions based on network conditions and client capabilities.
- **Adaptive Bitrate Streaming** - Allows the streamer to adapt its video bitrate in real-time based on network conditions and client capabilities.

> [!CAUTION]
>
> By default, TURN is enabled to ensure nearly universal connectivity. However, this comes with trade-offs: relaying adds latency, and TCP/TLS can perform poorly under network congestion, causing video to slow down or freeze.
> You can disable TURN by specifying your own [Connect.Params.iceServer] in [Streamer.start] and [Player.start] methods to override the default settings.


## Requirements

#### 1. Node Package Manager (npm)
Download and install npm from https://nodejs.org/en/download

#### 2. Create a Ceeblue Account
To create a Stream, you will need a Ceeblue account on [Ceeblue Cloud API] or [Ceeblue Dashboard]. A trial account is sufficient. If you do not have one yet, you can request one on the [Ceeblue website].

#### 3. Create a Stream
To use this library you'll first need to create a stream either through [Ceeblue Cloud API] or via the [Ceeblue Dashboard]. Use the [Quick Start Guide] for fast results.

Once the stream is created, retrieve its `<endpoint>` from the API in the `signallingUri` field. The value takes the following form, with an `in+` prefix when the stream is transcoded, or `as+` when it is not:
``` 
wss://<hostname>/webrtc/in+12423351-d0a2-4f0f-98a0-015b73f934f2  
```

> [!IMPORTANT]
>
> By default, we use `wss` (WebSocket over TLS) for signaling, as it enables advanced features such as adaptive bitrate (ABR). However, you can use `https` for [WHIP] and [WHEP] if you don’t need these additional features or require compatibility with other systems.

You will also need the `WebRTC <endpoint>` for playback, which is provided from API in the `uri` field. The value takes the following form, with an `out+` prefix when the stream is transcoded, or `as+` when it is not:
```
wss://<hostname>/webrtc/out+12423351-d0a2-4f0f-98a0-015b73f934f2
```

> [!NOTE]
>
> From [Ceeblue Dashboard] you can create an output `WebRTC endpoint` by clicking on the Viewer's eye 👁 button.


## Usage

Add the library as a dependency to your project using:
```
npm install @ceeblue/webrtc-client
```
Then [import] the library into your project with:
 ```javascript
import * as WebRTC from '@ceeblue/webrtc-client';
```

> [!TIP]
> 
> If your project uses TypeScript, it is recommended to set `"target": "ES6"` in your configuration to align with our usage of ES6 features and ensures that your build will succeed.\
> Set `"moduleResolution": "Node"` in **tsconfig.json** to ensure TypeScript resolves imports correctly for Node.js.
>   ```json
>   {
>      "compilerOptions": {
>         "target": "ES6",
>         "moduleResolution": "Node"
>      }
>   }
>   ```
> If you require a backwards-compatible [UMD] version, we recommend [building it locally](#building-locally).

### Publish a stream

To publish a stream use the [Streamer](./src/Streamer.ts) class with the `<endpoint>` you saved while [creating the stream](#3-create-a-stream). A complete example is available in [streamer.html](./examples/player.html) under [Examples](#examples).

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
   endPoint: 'wss://<hostname>/webrtc/in+12423351-d0a2-4f0f-98a0-015b73f934f2'
});
```
> [!NOTE]
> 
> For complete details on the connection parameters, see the [Connect.Params type] in [web-utils project].

### Play a stream

To play the stream use the [Player](./src/Player.ts) class with the `WebRTC <endpoint>` you saved while [creating the stream](#3-create-a-stream). A complete example is available in [player.html](./examples/player.html) under [Examples](#examples).

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
   endPoint: 'wss://<hostname>/webrtc/out+12423351-d0a2-4f0f-98a0-015b73f934f2'
});
```
> [!NOTE]
> 
> For complete details on the connection parameters, see the [Connect.Params type] in [web-utils project].


## Examples

To help you get started, we provide the following examples:

- [/examples/streamer.html](./examples/streamer.html) - Publish a stream with your webcam
- [/examples/player.html](./examples/player.html) - Play a stream
- [/examples/player-with-timed-metadata.html](./examples/player-with-timed-metadata.html) - Play a stream with timed metadata

> [!TIP]
> 
> To serve the examples locally, run a [static http-server] in the project directory:
>```
>npx http-server . -p 8081
>```
>

1. Open the streamer in your browser, with the `WebRTC <endpoint>` you saved while [creating the stream](#3-create-a-stream).

   ```html
   http://localhost:8081/examples/streamer.html?endPoint=<endPoint>
   ```

2. Click on **Start streaming**. The live stream from your webcam will start.\
   If your browser requests permission to access your camera, make sure to grant it.

3. Open a separate browser window and go to the player URL below, using the same `WebRTC <endpoint>`.

   ```html
   http://localhost:8081/examples/player.html?endPoint=<endPoint>
   ```

4. Click **Play** to start watching the live stream.


## Building locally

1. [Clone] this repository
2. Enter the `webrtc-client` folder and run `npm install` to install packages dependencies.
3. Execute `npm run build`. The output will be the following files placed in the **/dist/** folder:
   - **webrtc-client.d.ts** - Typescript definitions file
   - **webrtc-client.js** - NPM JavaScript library
   - **webrtc-client.bundle.js** - Bundled browser JavaScript library
```
git clone https://github.com/CeeblueTV/webrtc-client.git
cd webrtc-client
npm install
npm run build
```

> [!NOTE]
>
> Each JavaScript file is accompanied by a minified  `min.js` version and a `.map` source map file

> [!TIP]
>
> By default, the project format is ES module.\
> However, you can build the project for the supported module systems (CommonJS or IIFE) using the following commands:
>   ```
>   npm run build:cjs
>   npm run build:iife
>   ```
>  
> The default target is ES6.\
> If you want to manually test other targets (even though they are not officially supported), you can experiment with:
>   ```
>   npm run build -- --target esnext
>   npm run build:cjs -- --target esnext
>   ```
>
> Run the watch command to automatically rebuild the bundles whenever changes are made:
>   ```
>   npm run watch
>   ```
>
> If you prefer to watch and build for a specific target, use one of the following  commands:
>   ```
>   npm run watch:cjs
>   npm run watch:iife
>   ```


## Logs

WebRTC uses the [Log Engine] of [web-utils project].

There are four log levels:
- `LogLevel.ERROR` - Unrecoverable error
- `LogLevel.WARN`- Error which doesn't interrupt the current operation
- `LogLevel.INFO`- Informational messages at a frequency acceptable in production
- `LogLevel.DEBUG`- High-frequency messages intended for debugging

By default, only `LogLevel.ERROR` is enabled. To change the level, use the following approach:

```javascript
import { utils }  from '@ceeblue/webrtc-client';
const { log, LogLevel } = utils;
log.level = LogLevel.INFO; // displays errors, warns and infos
```

To disable all logging, use this approach:
```javascript
import { utils }  from '@ceeblue/webrtc-client';
const { log, } = utils;
log.level = false; // suppresses all log output, the opposite `true` value displays all the logs
```

> [!IMPORTANT]
>
> Beyond basic filtering, the [Log Engine] of the [web-utils project] also provides advanced features such as subscription, interception, redirection, and log redefinition.


## Documentation

You can find the latest built-in API documentation here:\
https://ceebluetv.github.io/webrtc-client/

To build the documentation locally, run:
```
npm run build:docs
```
This generates documentation files, which you can view by opening `./docs/index.html`.

> [!TIP]
> 
> To serve the documentation locally, run a [static http-server] in the `./docs/` directory:
>```
>npx http-server . -p 8081
>```
> You can then access the documentation at http://localhost:8081/.


## Contribution

All contributions are welcome. Please see [our contribution guide](/CONTRIBUTING.md) for details.


## License

By contributing code to this project, you agree to license your contribution under the [GNU Affero General Public License](/LICENSE).


[web-utils project]: https://github.com/CeeblueTV/web-utils
[Connect.Params.iceServer]: https://ceebluetv.github.io/web-utils/types/Connect.Params.html
[Player start]: https://ceebluetv.github.io/webrtc-client/classes/Player.html#start
[Streamer start]: https://ceebluetv.github.io/webrtc-client/classes/Streamer.html#start
[Log Engine]: https://ceebluetv.github.io/web-utils/interfaces/ILog.html
[Clone]: https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository
[UMD]: https://github.com/umdjs/umd
[import]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
[Ceeblue Dashboard]: https://dashboard.ceeblue.tv
[Ceeblue Cloud API]: https://docs.ceeblue.net/reference
[Ceeblue website]: https://ceeblue.net/free-trial/
[Quick Start Guide]: https://docs.ceeblue.net/reference/quick-start-guide
[static http-server]: https://www.npmjs.com/package/http-server
[Connect.Params type]: https://ceebluetv.github.io/web-utils/types/Connect.Params.html
[WHIP]: https://www.ietf.org/archive/id/draft-ietf-wish-whip-01.html
[WHEP]: https://www.ietf.org/archive/id/draft-murillo-whep-03.html

