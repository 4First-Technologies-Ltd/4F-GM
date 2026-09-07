/**
 * Nigeria's 36 states plus the Federal Capital Territory, each with its major
 * cities/areas. Used for the marketplace location filter (state → city) and
 * anywhere else a Nigerian address needs a controlled vocabulary.
 *
 * Cities are the commercially significant ones per state, not an exhaustive
 * list of LGAs — the filter is for finding a vendor, not for administration.
 */
export interface NigerianState {
  name: string;
  cities: string[];
}

export const NIGERIAN_STATES: NigerianState[] = [
  { name: 'Abia', cities: ['Umuahia', 'Aba', 'Ohafia', 'Arochukwu'] },
  { name: 'Adamawa', cities: ['Yola', 'Jimeta', 'Mubi', 'Numan', 'Ganye'] },
  { name: 'Akwa Ibom', cities: ['Uyo', 'Eket', 'Ikot Ekpene', 'Oron', 'Abak'] },
  { name: 'Anambra', cities: ['Awka', 'Onitsha', 'Nnewi', 'Ekwulobia', 'Ihiala'] },
  { name: 'Bauchi', cities: ['Bauchi', 'Azare', 'Misau', 'Jama’are', 'Katagum'] },
  { name: 'Bayelsa', cities: ['Yenagoa', 'Ogbia', 'Sagbama', 'Brass', 'Nembe'] },
  { name: 'Benue', cities: ['Makurdi', 'Gboko', 'Otukpo', 'Katsina-Ala', 'Vandeikya'] },
  { name: 'Borno', cities: ['Maiduguri', 'Biu', 'Bama', 'Dikwa', 'Monguno'] },
  { name: 'Cross River', cities: ['Calabar', 'Ugep', 'Ikom', 'Ogoja', 'Obudu'] },
  { name: 'Delta', cities: ['Asaba', 'Warri', 'Effurun', 'Sapele', 'Ughelli', 'Agbor'] },
  { name: 'Ebonyi', cities: ['Abakaliki', 'Afikpo', 'Onueke', 'Ezzamgbo'] },
  { name: 'Edo', cities: ['Benin City', 'Auchi', 'Ekpoma', 'Uromi', 'Igarra'] },
  { name: 'Ekiti', cities: ['Ado-Ekiti', 'Ikere-Ekiti', 'Ikole-Ekiti', 'Oye-Ekiti', 'Efon-Alaaye'] },
  { name: 'Enugu', cities: ['Enugu', 'Nsukka', 'Agbani', 'Awgu', 'Udi'] },
  { name: 'Gombe', cities: ['Gombe', 'Kaltungo', 'Billiri', 'Dukku', 'Bajoga'] },
  { name: 'Imo', cities: ['Owerri', 'Orlu', 'Okigwe', 'Mbaise', 'Oguta'] },
  { name: 'Jigawa', cities: ['Dutse', 'Hadejia', 'Gumel', 'Kazaure', 'Birnin Kudu'] },
  { name: 'Kaduna', cities: ['Kaduna', 'Zaria', 'Kafanchan', 'Zonkwa', 'Saminaka'] },
  { name: 'Kano', cities: ['Kano', 'Wudil', 'Gaya', 'Rano', 'Bichi'] },
  { name: 'Katsina', cities: ['Katsina', 'Daura', 'Funtua', 'Malumfashi', 'Dutsin-Ma'] },
  { name: 'Kebbi', cities: ['Birnin Kebbi', 'Argungu', 'Yauri', 'Zuru', 'Jega'] },
  { name: 'Kogi', cities: ['Lokoja', 'Okene', 'Idah', 'Kabba', 'Ankpa'] },
  { name: 'Kwara', cities: ['Ilorin', 'Offa', 'Omu-Aran', 'Jebba', 'Patigi'] },
  {
    name: 'Lagos',
    cities: [
      'Ikeja',
      'Lekki',
      'Victoria Island',
      'Ikoyi',
      'Lagos Marina',
      'Surulere',
      'Yaba',
      'Apapa',
      'Ajah',
      'Festac',
      'Agege',
      'Ikorodu',
      'Epe',
      'Badagry'
    ]
  },
  { name: 'Nasarawa', cities: ['Lafia', 'Keffi', 'Akwanga', 'Nasarawa', 'Karu'] },
  { name: 'Niger', cities: ['Minna', 'Suleja', 'Bida', 'Kontagora', 'New Bussa'] },
  { name: 'Ogun', cities: ['Abeokuta', 'Sagamu', 'Ijebu-Ode', 'Ota', 'Ilaro'] },
  { name: 'Ondo', cities: ['Akure', 'Ondo City', 'Owo', 'Ikare', 'Okitipupa'] },
  { name: 'Osun', cities: ['Osogbo', 'Ile-Ife', 'Ilesa', 'Ede', 'Iwo'] },
  { name: 'Oyo', cities: ['Ibadan', 'Ogbomoso', 'Oyo', 'Iseyin', 'Saki'] },
  { name: 'Plateau', cities: ['Jos', 'Bukuru', 'Pankshin', 'Shendam', 'Barkin Ladi'] },
  { name: 'Rivers', cities: ['Port Harcourt', 'Eleme', 'Oyigbo', 'Bonny', 'Omoku', 'Ahoada'] },
  { name: 'Sokoto', cities: ['Sokoto', 'Tambuwal', 'Illela', 'Gwadabawa', 'Bodinga'] },
  { name: 'Taraba', cities: ['Jalingo', 'Wukari', 'Bali', 'Takum', 'Ibi'] },
  { name: 'Yobe', cities: ['Damaturu', 'Potiskum', 'Gashua', 'Nguru', 'Geidam'] },
  { name: 'Zamfara', cities: ['Gusau', 'Kaura Namoda', 'Talata Mafara', 'Anka', 'Zurmi'] },
  {
    name: 'Federal Capital Territory',
    cities: [
      'Abuja Central',
      'Garki',
      'Wuse',
      'Maitama',
      'Asokoro',
      'Gwarinpa',
      'Kubwa',
      'Lugbe',
      'Nyanya',
      'Gwagwalada',
      'Kuje'
    ]
  }
];

export const STATE_NAMES: string[] = NIGERIAN_STATES.map((s) => s.name);

export function citiesIn(state: string): string[] {
  return NIGERIAN_STATES.find((s) => s.name === state)?.cities ?? [];
}
