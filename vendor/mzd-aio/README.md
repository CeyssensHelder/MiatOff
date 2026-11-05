# MZD-AIO files

Files from [Trevelopment/MZD-AIO](https://github.com/Trevelopment/MZD-AIO) (GPL-3.0, see `LICENSE`), copied
unmodified from commit `409c724ed860497b2a34f9367cb4a019287846ea`, path
`app/files/tweaks/config/<folder>/jci/nativegui/images/`. `SHA256SUMS` pins them; the AA-touch stick builder
refuses to use a file that does not match.

| Folder here | MZD-AIO tweak | Used for |
|---|---|---|
| `transparent-parking-sensor/` | Semi-Transparent Parking Sensor Graphics (`04_sensor-i.txt`) | Parking sensors: the 44 images whose size matches 74.00.324A and that differ from stock. MZD-AIO's `HorizontalSensors` arcs (smaller than the v74 ones) and its unchanged copies of stock images are not included. |
| `safety-warning-reverse-camera/` | Reverse Camera Safety Warning (`03_warning-i.txt`) | Camera text: the blank 800×50 safety text image. MZD-AIO ships 29 identical copies; one is kept here and written to the stick once per `SafetyText_*.png` of the unit. |
