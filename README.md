[Requirements](#requirements) | [Usage](#usage) | [Examples](#examples) | [Building locally](#building-locally) | [Documentation](#documentation) | [Contribution](#contribution) | [License](#license)

# Ceeblue WebRTC Client
[![npm](https://img.shields.io/npm/v/%40ceeblue%2Fwebrtc-client)](https://npmjs.org/package/@ceeblue/webrtc-client)

The Ceeblue WebRTC Client is a generic client library designed to simplify the implementation of WebRTC functionalities for Ceeblue customers.

The client library addresses common challenges faced by developers:
- **Unified Browser Support** - Addresses inconsistencies and variations in implementation across different browsers.
- **Firewall Traversal** - Implements our unique TURN approach to manage firewall traversal.
- **Security** - Ensures secure streaming through encryption and authentication.
- **Quality of Service (QoS)** - Handles latency, packet loss, and other optimizations.
- **Signalling** - Unifies different signalling capabilities over Websockets and WHIP/WHEP into a single, easy-to-use interface, with enhanced communication robustness.
- **Multi Bitrate Playback** - Enables the player to switch in real-time between multiple quality renditions based on network conditions and client capabilities.
- **Adaptive Bitrate Streaming** - Allows the streamer to adapt its video bitrate in real-time based on network conditions and client capabilities.

## Requirements

| Item | Description |
| --- | --- |
| **Ceeblue Account** | To create a Stream, you will need an active account with [Ceeblue Streaming Cloud](https://dashboard.ceeblue.tv).<br>A trial account is sufficient. If you do not have one yet, you can request one on the [Ceeblue website](https://ceeblue.net/free-trial/). |
| **Stream** | To use this library, you'll first need to create a stream either through [our Rest API](https://docs.ceeblue.net/reference) or on [the dashboard](https://dashboard.ceeblue.tv).<br><br>Use the following steps:<ol><li><a href="https://docs.ceeblue.net/reference/create-a-new-stream" target="_blank">Create a new stream</a></li><li>Copy the **Stream name (UUID)**</li><li>Copy the **Endpoint**</li></ol> |
| **Node Package Manager (npm)** | Download and install from https://nodejs.org/en/download |
| **http-server** | (Optional) Simple, zero-configuration command-line static HTTP server<br><br>The <a href="https://www.npmjs.com/package/http-server" target="_blank">http-server</a> is useful to explore the WebRTC client [examples](#examples) or the [documentation](#documentation) locally when you do not have a host.<br><br>To start the server, use the following command: `http-server . -p 8081`|

### WebRTC URL format

**Stream name (UUID)** and **Endpoint** are part of the URL used to access the stream that will be given by Ceeblue either from [the API](https://docs.ceeblue.net/reference) or [the dashboard](https://dashboard.ceeblue.tv), and they are required to publish or play a stream. The WebRTC signalling URL format is as follows:

```
[wss|https]://<endPoint>/webrtc/<streamName>
```

The `<endPoint>` is the host part of this URL, and `<streamName>` is the unique identifier for your stream.

The signalling protocol can be either `wss` (WebSocket Secure) or `https` (for WHIP/WHEP). We recommend `wss` for WebRTC because it unlocks additional features, such as adaptive bitrate (ABR).

## Usage

Add the library as a dependency to your npm project using:
```
npm install @ceeblue/webrtc-client
```
Then [import](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) the library into your project with:
 ```javascript
import * as WebRTC from '@ceeblue/webrtc-client';
```
> 💡 **TIP**
> 
> If your project uses [TypeScript](https://www.typescriptlang.org/), it is recommended to set `"target": "ES6"` in your configuration to align with our usage of ES6 features and ensures that your build will succeed (for those requiring a backwards-compatible [UMD](https://github.com/umdjs/umd) version, a [local build](#building-locally) is advised).
> Then defining the compiler option `"moduleResolution": "Node"` in **tsconfig.json** helps with import errors by ensuring that TypeScript uses the correct strategy for resolving imports based on the targeted Node.js version.
>   ```json
>   {
>      "compilerOptions": {
>         "target": "ES6",
>         "moduleResolution": "Node"
>      }
>   }
>   ```

### Publish a stream

To publish the stream `<streamName>` to `<endPoint>`, use the [Streamer](./src/Streamer.ts) class and the variables you noted in the [Requirements](#requirements) section when you created the stream. For a full example, see streamer.html in [Examples](#examples).

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

> The `<endPoint>` field can be either the hostname part of [the WebRTC URL](#webrtc-url-format) or the full URL itself. For example, if your WebRTC URL is `wss://example.com/webrtc/1234`, you can use either `example.com` or `wss://example.com/webrtc/1234` as the `<endPoint>`. If you pass the full URL, `<streamName>` parameter becomes an output parameter and is assigned after being extracted from the URL.
> See the type `Params` in the file [Connect.ts from web-utils](https://github.com/CeeblueTV/web-utils/blob/main/src/Connect.ts) for more details about the parameters of connection.

### Play a stream

To play the stream `<streamName>` from `<endPoint>`, use the [Player](./src/Player.ts) class and the variables you noted in the [Requirements](#requirements) section when you created the stream. For a full example, see player.html in [Examples](#examples).

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

> The `<endPoint>` field can be either the hostname part of [the WebRTC URL](#webrtc-url-format) or the full URL itself. For example, if your WebRTC URL is `wss://example.com/webrtc/1234`, you can use either `example.com` or `wss://example.com/webrtc/1234` as the `<endPoint>`. If you pass the full URL, `<streamName>` parameter becomes an output parameter and is assigned after being extracted from the URL.
> See the type `Params` in the file [Connect.ts from web-utils](https://github.com/CeeblueTV/web-utils/blob/main/src/Connect.ts) for more details about the parameters of connection.

## Examples

To understand how to use the library through examples, we provide three illustrations of its implementation:

- [/examples/streamer.html](./examples/streamer.html) → Publish a stream with your webcam
- [/examples/player.html](./examples/player.html) → Play a stream
- [/examples/player-with-timed-metadata.html](./examples/player-with-timed-metadata.html) → Play a stream with timed metadata

1. In your project directory, if you have installed the [http-server service](#requirements), execute the following command from the Terminal prompt by navigating to:

    ```shell
    http-server . -p 8081
    ```

2. Navigate to the specified address in your browser, making sure to replace any placeholders in the URL with the variables you have copied during the [stream setup](#requirements) in the dashboard.

    ```html
    http://localhost:8081/examples/streamer.html?host=<endPoint>&stream=<streamName>
    ```

3. Click on **Start streaming**. Upon doing so, a live stream from your webcam will initiate. Should your browser request permission to access your camera, ensure to grant it.

4. In the address bar of a separate browser window, enter the following address, making sure to replace the placeholders in the URL with the variables you have copied while configuring the [stream setup](#requirements) in the dashboard.

    ```html
    http://localhost:8081/examples/player.html?host=<endPoint>&stream=<streamName>
    ```

5. Click **Play** to start watching the live stream.

## Building locally

1. [Clone](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository) this repository
2. Enter the `webrtc-client` folder and run `npm install` to install packages dependencies.
3. Execute `npm run build`. The output will be the following files placed in the **/dist/** folder:
   - **webrtc-client.d.ts:** Typescript definitions file
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

```
git clone https://github.com/CeeblueTV/webrtc-client.git
cd webrtc-client
npm install
npm run build
```

> 💡 **TIP**
>
> - By default, the project format is ES module. However, you can build the project for the supported module systems—cjs or iife—using the following commands:
>   ```
>   npm run build:cjs
>   npm run build:iife
>   ```
>  
> - The default target is ES6. If you want to manually test other targets (although they are not officially supported), you can always experiment it with:
>   ```
>   npm run build -- --target esnext
>   npm run build:cjs -- --target esnext
>   ```
>
> - To automatically rebuild the bundles whenever changes are made, run the watch command. This command continuously monitors your project files and rebuilds the bundles as needed:
>   ```
>   npm run watch
>   ```
>   If you prefer to watch and build for a specific target, use one of these commands:
>   ```
>   npm run watch:cjs
>   npm run watch:iife
>   ```

## Documentation

This monorepo also contains built-in documentation about the APIs in the library, which can be built using the following npm command:
```
npm run build:docs
```
Once generated, open the `index.html` file located in the `docs` folder (`./docs/index.html`) with your browser, or if you have installed and started the [http-server service](#requirements) by navigating to:
```
http://localhost:8081/docs/
```
> 📌 **NOTE**
>
>  An online, continuously maintained version of the latest released documentation is available at https://ceebluetv.github.io/webrtc-client/

## Contribution

All contributions are welcome. Please see [our contribution guide](/CONTRIBUTING.md) for details.

## License

By contributing code to this project, you agree to license your contribution under the [GNU Affero General Public License](/LICENSE).
