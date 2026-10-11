/**
 * mimo-tts entry module, named by the root PLUGIN.md `entry` field.
 *
 * Registers the MiMo speech wire `mimo` (declared in `contributes.wires`;
 * the host namespaces it to `mimo-tts/mimo`). The wire uses the host's HTTP
 * helpers (`covel.http` = { fetchWithRetry, validateBaseUrl }), so the
 * package needs no dependency.
 */

import buildWires from "../lib/wires.js";

export default function register(covel) {
  covel.registerWires(buildWires(covel.http));
}
