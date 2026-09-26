import type { Borough } from "@/models/property";

export interface NeighborhoodProfile {
  name: string;
  borough: Borough;
  city: string;
  zip: string;
  lat: number;
  lng: number;
  /** Base price per square foot for a typical sale listing. */
  ppsf: number;
  streets: readonly [string, string][];
  /** Location dimension baselines in [0, 1]. */
  location: {
    near_transit: number;
    walkability: number;
    quiet: number;
    dense_urban: number;
    suburban_feel: number;
    water_views: number;
  };
}

/** Approximate NYC neighborhood centroids. Locations are demo approximations, not real listings. */
export const NEIGHBORHOODS: readonly NeighborhoodProfile[] = [
  { name: "Upper West Side", borough: "Manhattan", city: "New York", zip: "10024", lat: 40.787, lng: -73.9754, ppsf: 1450, streets: [["W 86th St", "Amsterdam Ave"], ["W 79th St", "Columbus Ave"], ["W 92nd St", "West End Ave"]], location: { near_transit: 0.9, walkability: 0.95, quiet: 0.5, dense_urban: 0.7, suburban_feel: 0.05, water_views: 0.15 } },
  { name: "Upper East Side", borough: "Manhattan", city: "New York", zip: "10021", lat: 40.7736, lng: -73.9566, ppsf: 1400, streets: [["E 72nd St", "Lexington Ave"], ["E 81st St", "York Ave"], ["E 68th St", "Madison Ave"]], location: { near_transit: 0.88, walkability: 0.95, quiet: 0.5, dense_urban: 0.7, suburban_feel: 0.05, water_views: 0.1 } },
  { name: "Chelsea", borough: "Manhattan", city: "New York", zip: "10011", lat: 40.7465, lng: -74.0014, ppsf: 1700, streets: [["W 22nd St", "9th Ave"], ["W 18th St", "10th Ave"], ["W 25th St", "8th Ave"]], location: { near_transit: 0.92, walkability: 0.98, quiet: 0.3, dense_urban: 0.9, suburban_feel: 0.02, water_views: 0.25 } },
  { name: "East Village", borough: "Manhattan", city: "New York", zip: "10009", lat: 40.7265, lng: -73.9815, ppsf: 1300, streets: [["E 7th St", "Avenue A"], ["E 11th St", "2nd Ave"], ["E 4th St", "Avenue B"]], location: { near_transit: 0.85, walkability: 0.98, quiet: 0.2, dense_urban: 0.95, suburban_feel: 0.02, water_views: 0.05 } },
  { name: "Tribeca", borough: "Manhattan", city: "New York", zip: "10013", lat: 40.7163, lng: -74.0086, ppsf: 2100, streets: [["Franklin St", "Hudson St"], ["N Moore St", "Greenwich St"], ["Duane St", "Church St"]], location: { near_transit: 0.9, walkability: 0.95, quiet: 0.45, dense_urban: 0.75, suburban_feel: 0.02, water_views: 0.3 } },
  { name: "Financial District", borough: "Manhattan", city: "New York", zip: "10004", lat: 40.7075, lng: -74.0113, ppsf: 1400, streets: [["Wall St", "William St"], ["Pine St", "Pearl St"], ["Broad St", "Beaver St"]], location: { near_transit: 0.97, walkability: 0.9, quiet: 0.35, dense_urban: 0.9, suburban_feel: 0.02, water_views: 0.45 } },
  { name: "Harlem", borough: "Manhattan", city: "New York", zip: "10027", lat: 40.8116, lng: -73.9465, ppsf: 900, streets: [["W 123rd St", "Adam Clayton Powell Jr Blvd"], ["W 132nd St", "Lenox Ave"], ["W 118th St", "Frederick Douglass Blvd"]], location: { near_transit: 0.85, walkability: 0.9, quiet: 0.45, dense_urban: 0.7, suburban_feel: 0.05, water_views: 0.05 } },
  { name: "Hell's Kitchen", borough: "Manhattan", city: "New York", zip: "10036", lat: 40.7638, lng: -73.9918, ppsf: 1350, streets: [["W 46th St", "9th Ave"], ["W 51st St", "10th Ave"], ["W 43rd St", "11th Ave"]], location: { near_transit: 0.95, walkability: 0.97, quiet: 0.2, dense_urban: 0.95, suburban_feel: 0.02, water_views: 0.3 } },
  { name: "Washington Heights", borough: "Manhattan", city: "New York", zip: "10033", lat: 40.8417, lng: -73.9394, ppsf: 750, streets: [["W 181st St", "Fort Washington Ave"], ["W 187th St", "Cabrini Blvd"], ["W 175th St", "Broadway"]], location: { near_transit: 0.8, walkability: 0.85, quiet: 0.55, dense_urban: 0.6, suburban_feel: 0.08, water_views: 0.35 } },
  { name: "Battery Park City", borough: "Manhattan", city: "New York", zip: "10280", lat: 40.7115, lng: -74.0156, ppsf: 1500, streets: [["South End Ave", "Albany St"], ["River Terrace", "Warren St"], ["Rector Pl", "South End Ave"]], location: { near_transit: 0.8, walkability: 0.85, quiet: 0.75, dense_urban: 0.45, suburban_feel: 0.15, water_views: 0.85 } },
  { name: "Williamsburg", borough: "Brooklyn", city: "Brooklyn", zip: "11211", lat: 40.7081, lng: -73.9571, ppsf: 1300, streets: [["N 6th St", "Kent Ave"], ["Metropolitan Ave", "Driggs Ave"], ["Grand St", "Bedford Ave"]], location: { near_transit: 0.85, walkability: 0.95, quiet: 0.3, dense_urban: 0.85, suburban_feel: 0.03, water_views: 0.35 } },
  { name: "Park Slope", borough: "Brooklyn", city: "Brooklyn", zip: "11215", lat: 40.671, lng: -73.9814, ppsf: 1250, streets: [["5th St", "7th Ave"], ["Garfield Pl", "8th Ave"], ["President St", "6th Ave"]], location: { near_transit: 0.82, walkability: 0.95, quiet: 0.7, dense_urban: 0.45, suburban_feel: 0.15, water_views: 0.02 } },
  { name: "DUMBO", borough: "Brooklyn", city: "Brooklyn", zip: "11201", lat: 40.7033, lng: -73.9881, ppsf: 1700, streets: [["Water St", "Main St"], ["Front St", "Washington St"], ["Plymouth St", "Adams St"]], location: { near_transit: 0.8, walkability: 0.92, quiet: 0.45, dense_urban: 0.7, suburban_feel: 0.03, water_views: 0.8 } },
  { name: "Bushwick", borough: "Brooklyn", city: "Brooklyn", zip: "11237", lat: 40.6944, lng: -73.9213, ppsf: 850, streets: [["Troutman St", "Wyckoff Ave"], ["Harman St", "Irving Ave"], ["Jefferson St", "Knickerbocker Ave"]], location: { near_transit: 0.78, walkability: 0.88, quiet: 0.35, dense_urban: 0.75, suburban_feel: 0.05, water_views: 0.02 } },
  { name: "Bedford-Stuyvesant", borough: "Brooklyn", city: "Brooklyn", zip: "11216", lat: 40.6872, lng: -73.9418, ppsf: 800, streets: [["Macon St", "Lewis Ave"], ["Hancock St", "Tompkins Ave"], ["MacDonough St", "Stuyvesant Ave"]], location: { near_transit: 0.75, walkability: 0.88, quiet: 0.65, dense_urban: 0.5, suburban_feel: 0.12, water_views: 0.02 } },
  { name: "Greenpoint", borough: "Brooklyn", city: "Brooklyn", zip: "11222", lat: 40.7304, lng: -73.9515, ppsf: 1100, streets: [["Milton St", "Franklin St"], ["Java St", "Manhattan Ave"], ["Eagle St", "West St"]], location: { near_transit: 0.65, walkability: 0.9, quiet: 0.55, dense_urban: 0.55, suburban_feel: 0.08, water_views: 0.45 } },
  { name: "Brooklyn Heights", borough: "Brooklyn", city: "Brooklyn", zip: "11201", lat: 40.696, lng: -73.9933, ppsf: 1500, streets: [["Pierrepont St", "Hicks St"], ["Remsen St", "Henry St"], ["Joralemon St", "Clinton St"]], location: { near_transit: 0.88, walkability: 0.95, quiet: 0.8, dense_urban: 0.45, suburban_feel: 0.12, water_views: 0.5 } },
  { name: "Crown Heights", borough: "Brooklyn", city: "Brooklyn", zip: "11213", lat: 40.6694, lng: -73.9422, ppsf: 800, streets: [["Park Pl", "Nostrand Ave"], ["Sterling Pl", "Kingston Ave"], ["St Johns Pl", "Rogers Ave"]], location: { near_transit: 0.8, walkability: 0.88, quiet: 0.55, dense_urban: 0.6, suburban_feel: 0.1, water_views: 0.02 } },
  { name: "Bay Ridge", borough: "Brooklyn", city: "Brooklyn", zip: "11209", lat: 40.6264, lng: -74.0299, ppsf: 650, streets: [["Shore Rd", "79th St"], ["Ridge Blvd", "85th St"], ["3rd Ave", "72nd St"]], location: { near_transit: 0.55, walkability: 0.8, quiet: 0.8, dense_urban: 0.3, suburban_feel: 0.45, water_views: 0.45 } },
  { name: "Prospect Lefferts Gardens", borough: "Brooklyn", city: "Brooklyn", zip: "11225", lat: 40.659, lng: -73.95, ppsf: 750, streets: [["Midwood St", "Bedford Ave"], ["Maple St", "Rogers Ave"], ["Lincoln Rd", "Flatbush Ave"]], location: { near_transit: 0.78, walkability: 0.85, quiet: 0.7, dense_urban: 0.45, suburban_feel: 0.2, water_views: 0.02 } },
  { name: "Astoria", borough: "Queens", city: "Astoria", zip: "11102", lat: 40.7644, lng: -73.9235, ppsf: 850, streets: [["30th Ave", "33rd St"], ["Ditmars Blvd", "31st St"], ["Broadway", "36th St"]], location: { near_transit: 0.78, walkability: 0.9, quiet: 0.55, dense_urban: 0.55, suburban_feel: 0.15, water_views: 0.15 } },
  { name: "Long Island City", borough: "Queens", city: "Long Island City", zip: "11101", lat: 40.7447, lng: -73.9485, ppsf: 1250, streets: [["Center Blvd", "48th Ave"], ["Jackson Ave", "Court Sq"], ["44th Dr", "Vernon Blvd"]], location: { near_transit: 0.93, walkability: 0.85, quiet: 0.45, dense_urban: 0.75, suburban_feel: 0.03, water_views: 0.65 } },
  { name: "Forest Hills", borough: "Queens", city: "Forest Hills", zip: "11375", lat: 40.7196, lng: -73.8448, ppsf: 700, streets: [["Austin St", "71st Ave"], ["Ascan Ave", "Burns St"], ["Queens Blvd", "70th Rd"]], location: { near_transit: 0.75, walkability: 0.82, quiet: 0.75, dense_urban: 0.35, suburban_feel: 0.45, water_views: 0.02 } },
  { name: "Sunnyside", borough: "Queens", city: "Sunnyside", zip: "11104", lat: 40.7433, lng: -73.9196, ppsf: 650, streets: [["Skillman Ave", "43rd St"], ["39th Ave", "47th St"], ["Queens Blvd", "46th St"]], location: { near_transit: 0.82, walkability: 0.88, quiet: 0.6, dense_urban: 0.5, suburban_feel: 0.2, water_views: 0.02 } },
  { name: "Riverdale", borough: "Bronx", city: "Bronx", zip: "10471", lat: 40.89, lng: -73.912, ppsf: 450, streets: [["Palisade Ave", "W 254th St"], ["Johnson Ave", "W 235th St"], ["Netherland Ave", "W 239th St"]], location: { near_transit: 0.45, walkability: 0.6, quiet: 0.9, dense_urban: 0.15, suburban_feel: 0.7, water_views: 0.45 } },
  { name: "Mott Haven", borough: "Bronx", city: "Bronx", zip: "10454", lat: 40.8091, lng: -73.9229, ppsf: 700, streets: [["Bruckner Blvd", "Alexander Ave"], ["E 138th St", "Willis Ave"], ["Lincoln Ave", "E 134th St"]], location: { near_transit: 0.8, walkability: 0.82, quiet: 0.35, dense_urban: 0.7, suburban_feel: 0.05, water_views: 0.3 } },
  { name: "St. George", borough: "Staten Island", city: "Staten Island", zip: "10301", lat: 40.6437, lng: -74.0776, ppsf: 500, streets: [["Stuyvesant Pl", "Wall St"], ["Hamilton Ave", "St Marks Pl"], ["Richmond Terrace", "Hyatt St"]], location: { near_transit: 0.6, walkability: 0.7, quiet: 0.65, dense_urban: 0.25, suburban_feel: 0.5, water_views: 0.65 } },
  { name: "Todt Hill", borough: "Staten Island", city: "Staten Island", zip: "10304", lat: 40.601, lng: -74.11, ppsf: 450, streets: [["Todt Hill Rd", "Ocean Terrace"], ["Four Corners Rd", "Flagg Pl"], ["Benedict Rd", "Merrick Ave"]], location: { near_transit: 0.15, walkability: 0.3, quiet: 0.95, dense_urban: 0.05, suburban_feel: 0.95, water_views: 0.15 } },
  { name: "Tottenville", borough: "Staten Island", city: "Staten Island", zip: "10307", lat: 40.512, lng: -74.24, ppsf: 400, streets: [["Main St", "Amboy Rd"], ["Hopping Ave", "Arthur Kill Rd"], ["Page Ave", "Hylan Blvd"]], location: { near_transit: 0.3, walkability: 0.45, quiet: 0.9, dense_urban: 0.05, suburban_feel: 0.9, water_views: 0.35 } },
];
