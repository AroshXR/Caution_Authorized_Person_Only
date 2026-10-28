# A Little Birthday Magic

A real-time 3D birthday cake inspired by the supplied video: chocolate sponge, pink filling, white drip icing, and a pink striped candle. It uses stars and confetti, with neutral birthday messages.

## Run locally

From this directory run:

```powershell
npm start
```

Open http://127.0.0.1:4173 in a modern browser with WebGL 2. The browser dependencies are already included in `dist/vendor`, so running the page does not require an install or a build. Serve the files over HTTP rather than opening `index.html` directly.

## Interactions

- Click **Light the candle**, then **Make a wish** to blow it out and launch confetti.
- Drag the cake to rotate it. Focus the cake and use the left/right arrow keys for keyboard rotation.
- **Make it personal** changes the name, message, and cake flavour. The page URL retains these values, so reloading preserves the customization.
- The entrance drops seven full-size pieces from the sky: sponge, cream, sponge, cream, sponge, icing, and candle. Gravity, small rebounds, stardust, expanding rings, and a moving camera create the arrival over about eight seconds.
- **Start again** replays the arrival. **Pause motion** freezes the entrance midair as well as idle rotation, floating, and twinkling. **Skip intro** settles the cake immediately. Reduced motion starts with the finished cake.
- The sound button enables quiet synthesized chimes. Sound starts only after a user action.

## How it is developed

`dist/index.html` contains the accessible interface, `dist/style.css` contains the responsive design, and `dist/app.js` creates and animates the scene with Three.js. `dist/layer-motion.js` defines the falling sequence, gravity, landing compression, and rebounds. Cake layers use cylinder geometry, the icing uses a custom drip mesh, and the piped cream uses twisted lathe geometry. The candle and sponge textures are generated with canvas. OrbitControls supplies damped dragging after the cinematic entrance. The render loop animates the arrival, flame, smoke, and confetti using elapsed time.

Validate the entrance physics and impact triggering with `node tools/layer-motion.test.mjs`.

To edit the default greeting, change `defaults` in `dist/app.js` and the matching initial text in `dist/index.html`. The `palette` object controls flavour colors. `buildCake()` controls the shape and decorations. Google Fonts are optional; system fonts are used if they cannot load.

## Deploy

The complete static website is in `dist/`. Upload that folder's contents to any static host. `dist/index.html` must sit at the published root, with `vendor/` beside it. The original reference video is excluded from the published website.

### GitHub Pages

The repository includes `.github/workflows/pages.yml`, which publishes only `dist/` on pushes to `master`. The website needs no install or build step.

1. Open the GitHub repository's **Settings > Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Commit and push the workflow to `master`.
4. Open the **Actions** tab and wait for **Deploy website to GitHub Pages** to succeed. To redeploy an existing commit, select that workflow and choose **Run workflow**.
5. Open https://aroshxr.github.io/Cake/.

Publishing the repository root with Jekyll shows the README because the website's `index.html` is inside `dist/`. This workflow places `dist/index.html` at the published root. Keep the relative asset paths so styles, scripts, and Three.js load under `/Cake/`.

If using Sites, keep the existing `.openai/hosting.json` project ID. Its initial audience is private, so access must be deliberately changed before someone else can open it.

## Update the 3D library

```powershell
npm install
node tools/sync-vendor.mjs
```

Three.js is pinned to 0.180.0. Its MIT license is included in `dist/vendor/LICENSE`.
