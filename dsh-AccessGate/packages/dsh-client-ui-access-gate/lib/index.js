//#region lib/types/index.js
/**
* Access-gate settings card, node half. The empty apply exists so the plugin
* appears in the host cordis.yml / Loader; the browser half owns the card
* through exports["./client"], discovered from the package.json dsh.client
* declaration. The namespace it edits (access-gate) is registered and exposed
* by the dsh-host-access-gate host plugin.
*/
/** Host plugin body — no host-side behavior for this surface plugin. */
function apply() {}
//#endregion
export { apply };
