/**
 * Philippine address Region → Province → City → Barangay cascades.
 * Shared by student registration and registrar settings.
 */

export async function fetchAddressData(staticBase = "/static/") {
  const base = staticBase.endsWith("/") ? staticBase : `${staticBase}/`;
  const [regions, provinces, cities, barangays] = await Promise.all([
    fetch(`${base}data/address/region.json`).then((r) => r.json()),
    fetch(`${base}data/address/province.json`).then((r) => r.json()),
    fetch(`${base}data/address/city.json`).then((r) => r.json()),
    fetch(`${base}data/address/barangay.json`).then((r) => r.json()),
  ]);
  return { regions, provinces, cities, barangays };
}

export function fillSelect(select, options, placeholder) {
  if (!select) return;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  options.forEach((opt) => {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    select.appendChild(o);
  });
}

function resolveEl(ref) {
  return typeof ref === "string" ? document.getElementById(ref) : ref;
}

/**
 * @param {object} options
 * @param {string} options.staticBase
 * @param {{ region: string|HTMLElement, province: string|HTMLElement, city: string|HTMLElement, barangay: string|HTMLElement }} options.selectors
 * @param {{ region?: string, province?: string, cityMunicipality?: string, barangay?: string }} [options.initial]
 * @param {(state: object) => void} [options.onChange]
 */
export async function initAddressCascade(options) {
  const data = await fetchAddressData(options.staticBase);
  const regionSel = resolveEl(options.selectors.region);
  const provinceSel = resolveEl(options.selectors.province);
  const citySel = resolveEl(options.selectors.city);
  const barangaySel = resolveEl(options.selectors.barangay);

  let state = {
    region: options.initial?.region || "",
    province: options.initial?.province || "",
    cityMunicipality: options.initial?.cityMunicipality || "",
    barangay: options.initial?.barangay || "",
  };

  function populate() {
    fillSelect(
      regionSel,
      data.regions.map((r) => ({ value: r.region_code, label: r.region_name })),
      "Select region"
    );

    const filteredProvinces = data.provinces.filter((p) => p.region_code === state.region);
    fillSelect(
      provinceSel,
      filteredProvinces.map((p) => ({ value: p.province_code, label: p.province_name })),
      "Select province"
    );
    if (provinceSel) provinceSel.disabled = !state.region;

    const filteredCities = data.cities.filter((c) => c.province_code === state.province);
    fillSelect(
      citySel,
      filteredCities.map((c) => ({ value: c.city_code, label: c.city_name })),
      "Select city/municipality"
    );
    if (citySel) citySel.disabled = !state.province;

    const filteredBarangays = data.barangays.filter((b) => b.city_code === state.cityMunicipality);
    fillSelect(
      barangaySel,
      filteredBarangays.map((b) => ({ value: b.brgy_code, label: b.brgy_name })),
      "Select barangay"
    );
    if (barangaySel) barangaySel.disabled = !state.cityMunicipality;

    if (state.region && regionSel) regionSel.value = state.region;
    if (state.province && provinceSel) provinceSel.value = state.province;
    if (state.cityMunicipality && citySel) citySel.value = state.cityMunicipality;
    if (state.barangay && barangaySel) barangaySel.value = state.barangay;
  }

  function setField(field, value) {
    if (field === "region") {
      state.region = value;
      state.province = "";
      state.cityMunicipality = "";
      state.barangay = "";
    } else if (field === "province") {
      state.province = value;
      state.cityMunicipality = "";
      state.barangay = "";
    } else if (field === "cityMunicipality") {
      state.cityMunicipality = value;
      state.barangay = "";
    } else if (field === "barangay") {
      state.barangay = value;
    }
    populate();
    options.onChange?.({ ...state });
  }

  regionSel?.addEventListener("change", () => setField("region", regionSel.value));
  provinceSel?.addEventListener("change", () => setField("province", provinceSel.value));
  citySel?.addEventListener("change", () => setField("cityMunicipality", citySel.value));
  barangaySel?.addEventListener("change", () => setField("barangay", barangaySel.value));

  populate();

  return {
    data,
    getState: () => ({ ...state }),
    setState: (partial) => {
      state = { ...state, ...partial };
      populate();
    },
    formatLabel(extraStreet = "") {
      const brgy = data.barangays.find((b) => b.brgy_code === state.barangay);
      const city = data.cities.find((c) => c.city_code === state.cityMunicipality);
      const prov = data.provinces.find((p) => p.province_code === state.province);
      const parts = [extraStreet, brgy?.brgy_name, city?.city_name, prov?.province_name].filter(Boolean);
      return parts.join(", ");
    },
    isComplete() {
      return Boolean(state.region && state.province && state.cityMunicipality && state.barangay);
    },
  };
}
