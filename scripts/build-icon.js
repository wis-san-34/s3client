const fs = require('fs');
const path = require('path');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;

(async () => {
  const dir = path.join(__dirname, '..', 'build', 'icons-temp');
  const sizes = [16,20,24,32,40,48,64,72,96,128,256];
  const inputs = sizes.map((s) => path.join(dir, `icon-${s}.png`));
  const ico = await pngToIco(inputs);
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.ico'), ico);
  fs.copyFileSync(path.join(__dirname, '..', 'build', 'icon-master.png'), path.join(__dirname, '..', 'build', 'icon.png'));
  console.log('Icon files generated.');
})();
