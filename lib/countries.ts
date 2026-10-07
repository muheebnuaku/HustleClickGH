// Every country (ISO code, name, phone dial code) plus regions/provinces for the
// markets we work in, so people pick from lists instead of typing.

import { GHANA_REGIONS } from "@/lib/constants";

export interface Country { code: string; name: string; dial: string; africa: boolean }

// code|name|dial  — Africa first, then the rest of the world.
const AFRICA = `DZ|Algeria|213;AO|Angola|244;BJ|Benin|229;BW|Botswana|267;BF|Burkina Faso|226;BI|Burundi|257;CV|Cabo Verde|238;CM|Cameroon|237;CF|Central African Republic|236;TD|Chad|235;KM|Comoros|269;CG|Congo|242;CD|DR Congo|243;CI|Côte d'Ivoire|225;DJ|Djibouti|253;EG|Egypt|20;GQ|Equatorial Guinea|240;ER|Eritrea|291;SZ|Eswatini|268;ET|Ethiopia|251;GA|Gabon|241;GM|Gambia|220;GH|Ghana|233;GN|Guinea|224;GW|Guinea-Bissau|245;KE|Kenya|254;LS|Lesotho|266;LR|Liberia|231;LY|Libya|218;MG|Madagascar|261;MW|Malawi|265;ML|Mali|223;MR|Mauritania|222;MU|Mauritius|230;MA|Morocco|212;MZ|Mozambique|258;NA|Namibia|264;NE|Niger|227;NG|Nigeria|234;RW|Rwanda|250;ST|São Tomé and Príncipe|239;SN|Senegal|221;SC|Seychelles|248;SL|Sierra Leone|232;SO|Somalia|252;ZA|South Africa|27;SS|South Sudan|211;SD|Sudan|249;TZ|Tanzania|255;TG|Togo|228;TN|Tunisia|216;UG|Uganda|256;ZM|Zambia|260;ZW|Zimbabwe|263`;
const WORLD = `AF|Afghanistan|93;AL|Albania|355;AD|Andorra|376;AG|Antigua and Barbuda|1;AR|Argentina|54;AM|Armenia|374;AU|Australia|61;AT|Austria|43;AZ|Azerbaijan|994;BS|Bahamas|1;BH|Bahrain|973;BD|Bangladesh|880;BB|Barbados|1;BY|Belarus|375;BE|Belgium|32;BZ|Belize|501;BT|Bhutan|975;BO|Bolivia|591;BA|Bosnia and Herzegovina|387;BR|Brazil|55;BN|Brunei|673;BG|Bulgaria|359;KH|Cambodia|855;CA|Canada|1;CL|Chile|56;CN|China|86;CO|Colombia|57;CR|Costa Rica|506;HR|Croatia|385;CU|Cuba|53;CY|Cyprus|357;CZ|Czechia|420;DK|Denmark|45;DM|Dominica|1;DO|Dominican Republic|1;EC|Ecuador|593;SV|El Salvador|503;EE|Estonia|372;FJ|Fiji|679;FI|Finland|358;FR|France|33;GE|Georgia|995;DE|Germany|49;GR|Greece|30;GD|Grenada|1;GT|Guatemala|502;GY|Guyana|592;HT|Haiti|509;HN|Honduras|504;HU|Hungary|36;IS|Iceland|354;IN|India|91;ID|Indonesia|62;IR|Iran|98;IQ|Iraq|964;IE|Ireland|353;IL|Israel|972;IT|Italy|39;JM|Jamaica|1;JP|Japan|81;JO|Jordan|962;KZ|Kazakhstan|7;KI|Kiribati|686;KW|Kuwait|965;KG|Kyrgyzstan|996;LA|Laos|856;LV|Latvia|371;LB|Lebanon|961;LI|Liechtenstein|423;LT|Lithuania|370;LU|Luxembourg|352;MY|Malaysia|60;MV|Maldives|960;MT|Malta|356;MH|Marshall Islands|692;MX|Mexico|52;FM|Micronesia|691;MD|Moldova|373;MC|Monaco|377;MN|Mongolia|976;ME|Montenegro|382;MM|Myanmar|95;NR|Nauru|674;NP|Nepal|977;NL|Netherlands|31;NZ|New Zealand|64;NI|Nicaragua|505;KP|North Korea|850;MK|North Macedonia|389;NO|Norway|47;OM|Oman|968;PK|Pakistan|92;PW|Palau|680;PS|Palestine|970;PA|Panama|507;PG|Papua New Guinea|675;PY|Paraguay|595;PE|Peru|51;PH|Philippines|63;PL|Poland|48;PT|Portugal|351;QA|Qatar|974;RO|Romania|40;RU|Russia|7;KN|Saint Kitts and Nevis|1;LC|Saint Lucia|1;VC|Saint Vincent and the Grenadines|1;WS|Samoa|685;SM|San Marino|378;SA|Saudi Arabia|966;RS|Serbia|381;SG|Singapore|65;SK|Slovakia|421;SI|Slovenia|386;SB|Solomon Islands|677;KR|South Korea|82;ES|Spain|34;LK|Sri Lanka|94;SR|Suriname|597;SE|Sweden|46;CH|Switzerland|41;SY|Syria|963;TW|Taiwan|886;TJ|Tajikistan|992;TH|Thailand|66;TL|Timor-Leste|670;TO|Tonga|676;TT|Trinidad and Tobago|1;TR|Türkiye|90;TM|Turkmenistan|993;TV|Tuvalu|688;UA|Ukraine|380;AE|United Arab Emirates|971;GB|United Kingdom|44;US|United States|1;UY|Uruguay|598;UZ|Uzbekistan|998;VU|Vanuatu|678;VA|Vatican City|39;VE|Venezuela|58;VN|Vietnam|84;YE|Yemen|967`;

const parse = (s: string, africa: boolean): Country[] =>
  s.split(";").map((row) => { const [code, name, dial] = row.split("|"); return { code, name, dial, africa }; });

export const COUNTRIES: Country[] = [...parse(AFRICA, true), ...parse(WORLD, false)];

/** Regions / provinces / states for the countries we recruit in most. */
export const REGIONS_BY_COUNTRY: Record<string, readonly string[]> = {
  Ghana: GHANA_REGIONS,
  Nigeria: ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT Abuja", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"],
  Malawi: ["Northern", "Central", "Southern"],
  Kenya: ["Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa", "Homa Bay", "Isiolo", "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi", "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu", "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa", "Murang'a", "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua", "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi", "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot"],
  Uganda: ["Central", "Eastern", "Northern", "Western"],
  Tanzania: ["Arusha", "Dar es Salaam", "Dodoma", "Geita", "Iringa", "Kagera", "Katavi", "Kigoma", "Kilimanjaro", "Lindi", "Manyara", "Mara", "Mbeya", "Morogoro", "Mtwara", "Mwanza", "Njombe", "Pemba North", "Pemba South", "Pwani", "Rukwa", "Ruvuma", "Shinyanga", "Simiyu", "Singida", "Songwe", "Tabora", "Tanga", "Zanzibar North", "Zanzibar South", "Zanzibar West"],
  Zambia: ["Central", "Copperbelt", "Eastern", "Luapula", "Lusaka", "Muchinga", "North-Western", "Northern", "Southern", "Western"],
  Rwanda: ["Kigali", "Eastern", "Northern", "Southern", "Western"],
  "South Africa": ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"],
  "Sierra Leone": ["Eastern", "Northern", "North West", "Southern", "Western Area"],
  Liberia: ["Bomi", "Bong", "Gbarpolu", "Grand Bassa", "Grand Cape Mount", "Grand Gedeh", "Grand Kru", "Lofa", "Margibi", "Maryland", "Montserrado", "Nimba", "River Cess", "River Gee", "Sinoe"],
  Gambia: ["Banjul", "Kanifing", "Central River", "Lower River", "North Bank", "Upper River", "West Coast"],
  Cameroon: ["Adamawa", "Centre", "East", "Far North", "Littoral", "North", "North-West", "South", "South-West", "West"],
  "Côte d'Ivoire": ["Abidjan", "Bas-Sassandra", "Comoé", "Denguélé", "Gôh-Djiboua", "Lacs", "Lagunes", "Montagnes", "Sassandra-Marahoué", "Savanes", "Vallée du Bandama", "Woroba", "Yamoussoukro", "Zanzan"],
  Togo: ["Centrale", "Kara", "Maritime", "Plateaux", "Savanes"],
  Ethiopia: ["Addis Ababa", "Afar", "Amhara", "Benishangul-Gumuz", "Central Ethiopia", "Dire Dawa", "Gambela", "Harari", "Oromia", "Sidama", "Somali", "South Ethiopia", "South West Ethiopia", "Tigray"],
  Zimbabwe: ["Bulawayo", "Harare", "Manicaland", "Mashonaland Central", "Mashonaland East", "Mashonaland West", "Masvingo", "Matabeleland North", "Matabeleland South", "Midlands"],
};

export function findCountry(name?: string | null): Country | undefined {
  const n = name?.trim().toLowerCase();
  return n ? COUNTRIES.find((c) => c.name.toLowerCase() === n || c.code.toLowerCase() === n) : undefined;
}

export const regionsFor = (country?: string | null): readonly string[] | undefined =>
  REGIONS_BY_COUNTRY[findCountry(country)?.name ?? ""];

