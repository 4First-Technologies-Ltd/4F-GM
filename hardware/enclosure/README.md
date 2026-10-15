# 4FG outdoor cylinder scale: enclosure CAD (prototype v0)

Parametric model of the physical device: a weighing platform that a gas cylinder (3 to 50 kg of gas)
stands on, with a sealed electronics pod on the front. Built with [replicad](https://replicad.xyz)
(OpenCascade) so it runs in plain Node, no CAD license needed.

```bash
cd hardware/enclosure
npm install
npm run build      # writes out/{bar,disc}/ : STEP, STL, DXF, build_report.json
node preview.mjs   # writes out/preview_{bar,disc}.html : open in a browser to orbit the model
```

All dimensions live in `params.mjs`. **Almost every number there is an assumption**, because no real
parts have been chosen yet. Change them and rebuild.

## What is in the model

| Part | Process (prototype) | Notes |
|---|---|---|
| Base plate 460 x 610 x 6 | Laser-cut 5083/6061 aluminium (DXF in `out/*/base_plate_6mm.dxf`) | Load cell bolts, 4 drains, pod ear holes, 2 ground-anchor holes |
| Top plate 460 x 460 x 8 | Laser-cut aluminium (`top_plate_8mm.dxf`) | Hand calc: ~0.4 mm mid-span deflection at 90 kg. Not a structural sign-off |
| 4 load cells | Bought | `bar` = shear-beam, `disc` = button cell. Plate hole patterns differ per variant, pick one folder |
| Rain skirt | 1.5 mm aluminium strip or ASA in segments | Hangs from top plate, 3 mm clear of base. Keeps splash off the load cells |
| Retainer ring (430 OD) | ASA, 4 quarter pieces (`05_..._x4`) | Keeps a 50 kg cylinder (assumed 380 to 400 mm) centred |
| Reducer rings | Laser-cut 10 mm HDPE/acrylic, or ASA in quarters | One per size. **Cylinder diameters are guesses, measure yours** |
| Electronics pod | ASA, gasketed lid, M4 heat-set inserts | IP65 target. 2x M16 glands (load cells), 1x M12 gland, SMA bulkhead for the 4G antenna, breather vent, 2 LED windows |

Pod interior layout, left to right: battery tray (2x D-size cells) | controller board | 4G modem.

## Open issues, in priority order

1. **The pod does not fit a typical printer.** Body is 344 x 130 mm with ears. Most desktop printers
   top out at 220 to 300 mm. Either split the pod into two halves, narrow it, or use a print service.
2. **Tip stability.** A 50 kg cylinder is ~1.2 m tall on a 460 mm platform. Add a strap or side
   guard before any outdoor trial. The retainer ring alone is not a safety feature.
3. **Battery and 4G.** A long-life primary cell (Li-SOCl2 D-size) cannot supply an LTE modem's
   current peaks on its own. It needs a hybrid layer capacitor or supercap in front of the modem.
   Confirm in the electronics design before locking the tray.
4. **HX711 is not industrial.** The old concept used it. For outdoor temperature swings use an
   industrial 24-bit bridge ADC (ADS1232/ADS1256/NAU7802 class) and keep it on the controller board.
5. **Bar load cell orientation and holes.** Hole pattern is one bolt per end as a placeholder. Match
   the real datasheet and its load-direction arrow before cutting plates.
6. **Capacity.** 4 x 100 kg cells give 400 kg rating for ~85 to 100 kg gross: robust against
   knocks, coarser resolution. 4 x 50 kg is the alternative if resolution matters more.
7. **Fasteners, gaskets and thermal** are not modelled (heat-set inserts, cord gasket, solar loading
   on a black ASA pod). Use white or light grey ASA.

## Files

- `params.mjs` all dimensions and assumed part envelopes
- `build.mjs` the model and exports; `dxf.mjs` tiny DXF writer; `preview.mjs` browser viewer
- `out/` generated, not committed
