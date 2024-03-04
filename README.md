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
| **Stream** | To use this library, you'll first need to create a stream either through our Rest API or on the dashboard.<br><br>Use the following steps:<ol><li><a href="https://docs.ceeblue.net/reference/create-a-new-stream" target="_blank">Create a new stream</a></li><li>Copy the **Stream name (UUID)**</li><li>Copy the **Endpoint**</li></ol> |
| **Node Package Manager (npm)** | Download and install from https://nodejs.org/en/download |
| **http-server** | (Optional) Simple, zero-configuration command-line static HTTP server<br><br>The <a href="https://www.npmjs.com/package/http-server" target="_blank">http-server</a> is useful to explore the WebRTC client [examples](#examples) or the [documentation](#documentation) locally when you do not have a host.<br><br>To start the server, use the following command: `http-server . -p 8081`|

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
> - If your project uses [TypeScript](https://www.typescriptlang.org/), it is recommended to set `"target": "ES6"` in your configuration. This setting aligns with our usage of ES6 features and ensures that your build will succeed. For those requiring a backwards-compatible UMD (Universal Module Definition) version, a [local build](#development) is advised.
> Defining the compiler option `"moduleResolution": "Node"` in **tsconfig.json** helps with import errors by ensuring that TypeScript uses the correct strategy for resolving imports based on the targeted Node.js version.
>   ```json
>   {
>      "compilerOptions": {
>         "target": "ES6",
>         "moduleResolution": "Node"
>      }
>   }
>   ```

### Publish a stream

To publish the stream `<streamName>` to `<endpoint>`, use the [Streamer](./src/Streamer.ts) class and the variables you saved while setting up the stream in the dashboard [Requirements](#requirements). For a full example, see push.html in [Examples](#examples).

```javascript
import Streamer as WebRTC from '@ceeblue/webrtc-client';

const streamer = new Streamer();
streamer.onStart = stream => {
   console.log('start streaming');
}
streamer.onStop = _ => {
   console.log('stop streaming');
}
navigator.mediaDevices
.getUserMedia({ audio: true, video: true })
.then(stream => {
   streamer.start(stream, {
      host: <endpoint>,
      streamName: <streamName>,
      iceServer: {
         urls: ['turn:' + <endPoint> + ':3478?transport=tcp', 'turn:' + <endPoint> + ':3478'],
         username: 'csc_demo', credential: 'UtrAFClFFO'
      }
   }
});
```

### Play a stream

To play the stream `<streamName>` from `<endPoint>`, use the [Player](./src/Player.ts) class and the variables you saved while setting up the stream in the dashboard [Requirements](#requirements). For a full example, see play.html in [Examples](#examples).

```javascript
import Player as WebRTC from '@ceeblue/webrtc-client';

const player = new Player();

player.onStart = stream => {
   videoElement.srcObject = stream;
   console.log('start playing');
}
player.onStop = _ => {
   console.log('stop playing');
}
streamer.start(stream, {
   host: <endPoint>,
      streamName: <streamName>,
      iceServer: {
      urls: ['turn:' + <endPoint> + ':3478?transport=tcp', 'turn:' + <endPoint> + ':3478'],
      username: 'csc_demo', credential: 'UtrAFClFFO'
   }
}
```

## Examples

To understand how to use the library through examples, we provide three illustrations of its implementation:

- [/examples/streamer.html](./examples/streamer.html) → Publish a stream with your webcam
- [/examples/player.html](./examples/player.html) → Play a stream
- [/examples/player-with-timed-metadata.html](./examples/player-with-timed-metadata.html) → Play a stream with timed metadata

1. In your project directory, [if you have installed the simple-http package](/#requirements), execute the following command from the Terminal prompt by navigating to:

    ```shell
    http-server . -p 8081
    ```

2. Navigate to the specified address in your browser, making sure to replace any placeholders in the URL with the variables you have copied during the [stream setup](/#requirements) in the dashboard.

    ```html
    http://localhost:8081/examples/streamer.html?host=<endpoint>&stream=<streamName>
    ```

3. Click on **Start streaming**. Upon doing so, a live stream from your webcam will initiate. Should your browser request permission to access your camera, ensure to grant it.

4. In the address bar of a separate browser window, enter the following address, making sure to replace the placeholders in the URL with the variables you have copied while configuring the [stream setup](/#requirements) in the dashboard.

    ```html
    http://localhost:8081/examples/player.html?host=<endpoint>&stream=<streamName>
    ```

5. Click **Play** to start watching the live stream.

## Building locally

1. [Clone](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository) this repository
2. Enter the `webrtc-client` folder and run `npm install` to install packages dependencies.
3. Execute `npm run build`. The output will be five files placed in the **/dist/** folder:
   - **webrtc-client.d.ts** Typescript definitions file
   - **webrtc-client.js**: Bundled JavaScript library
   - **webrtc-client.js.map**: Source map that associates the bundled library with the original source files
   - **webrtc-client.min.js** Minified version of the library, optimized for size
   - **webrtc-client.min.js.map** Source map that associates the minified library with the original source files

```
git clone https://github.com/CeeblueTV/webrtc-client.git
cd webrtc-client
npm install
npm run build
```

> 💡 **TIP**
>
> - To build a UMD (Universal Module Definition) version compatible with older browsers, you can run the following command:
>   ```
>   npm run build:es5
>   ```
>
> - To automatically build bundles when any modification has been applied, you can run a watch command. The watch command will continuously monitor your project files for changes and rebuild the bundles accordingly.
>   ```
>   npm run watch
>   ```
>   Or for ES5 (UMD):
>   ```
>   npm run watch:es5
>   ```

## Documentation

This monorepo also contains built-in documentation about the APIs in the library, which can be built using the following npm command:
```
npm run build:docs
```
You can access the documentation by opening the index.html file in the docs folder with your browser (`./docs/index.html`), or, if you have [installed and started the http-server](/#requirements), by navigating to:
```
http://localhost:8081/docs/
```

## Contribution

All contributions are welcome. Please see [our contribution guide](/CONTRIBUTING.md) for details.

## License

By contributing code to this project, you agree to license your contribution under the [GNU Affero General Public License](/LICENSE).
