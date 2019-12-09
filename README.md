# father's lullaby refresh

## Development
Install dependencies
```
npm install
```

Recording on mobile only works over https. Generate a self-signed certificate for local development use. 
This command creates two files—key.pem and cert.pem—in the root directory that will be used to run the app over https. 
```
npm run gen-key-cert
```

When loading the app in the browser, you will get a `ERR_CERT_AUTHORITY_INVALID` warning. The certificate we generate locally is self-signed, so the browser will say it is not secure. To load the app in Chrome, click "Advanced" and then "Proceed."

## Connecting to the roundware production server
1. Run the app over https:

    ```
    npm run prod
    ```

2. Load the app at `https://localhost:8090`.


## Connecting to a roundware development server

1. Clone [roundware-server](https://github.com/roundware/roundware-server), checkout the `develop` branch, and follow the 
readme instructions to run the server locally using vagrant.

2. The initial location is currently set to (1.0, 1.0). This is in the middle of an ocean, which shows up as white with the map styling. To change this, go to the `roundware-server` repo then `sample_project.json`. Change lines 263 & 264 to change the initial map location and lines 1193 & 1194 to change the sample audio recording location. Set these to your latitude & longitude or a nearby location. If you've already run the vagrant server, you need to run:

    ```
    vagrant destroy
    vagrant up
    ```
3. If you'd like to submit a recording and view it on the map, navigate to `http://localhost:8888/admin/` with the roundware-server running. Select 'Speakers' and then 'Add speaker'. This is how you define the active region that recordings can appear in. Fill out all the fields the same as the speaker already in the list but create a shape that covers your area. Save your new speaker.

4. The development roundware server does not run over HTTPS, which causes mixed content errors in some browsers. In order to get around this issue when running the frontend pointed at a local development instance of roundware, you must spin up a proxy server to "securely" route the traffic to the backend. Generate a self-signed SSL key and certificate for the proxy server and then start it up in the `web-lullaby` directory:
  
   ```
   npm run gen-proxy-key-cert
   npm run roundware-proxy
   ```

5. Navigate to the [URL of the proxy server](https://localhost:1234) in each browser and follow the prompts to accept the self-signed certificate as valid.

6. In a new terminal window, run the app over https:

   ```
   npm run dev
   ```
 
7. Load the app at `https://localhost:8080`. The app must be accessed at this specific address when connecting to the local
roundware server, as the address and port are whitelisted in the server to allow cross-origin resource sharing (CORS). 
