import type { ResearchDTO, SourceDTO } from "@/lib/api/types";

/**
 * Landing-page demonstration data, captured verbatim from real Pramaan production runs on 2026-10-01
 * (API responses from GET /api/v1/research/{id}). Nothing here is hand-written except the demo field-notes
 * document, which was uploaded for the grounded run. Web and academic sources were retrieved live.
 */

/** "How were lighthouses converted from kerosene lamps to electric light?" — web + academic. */
export const DEMO_GENERAL = {
 "id": "b0358ae8-65e4-4516-92ff-d8c801ae6711",
 "title": "How were lighthouses converted from kerosene lamps to electric light",
 "query": "How were lighthouses converted from kerosene lamps to electric light?",
 "mode": "standard",
 "channels": [
  "web",
  "academic"
 ],
 "projectId": null,
 "status": "completed",
 "createdAt": "2026-10-01T08:08:47.914261Z",
 "completedAt": "2026-10-01T08:10:26.449271Z",
 "saved": false,
 "visibility": "private",
 "shareId": null,
 "metrics": {
  "sources": 12,
  "evidence": 22,
  "candidateClaims": 10,
  "verifiedClaims": 7
 },
 "errorCode": null,
 "steps": [
  {
   "id": "understanding",
   "label": "Understanding question",
   "status": "complete",
   "detail": "Identified the question and scope — researching across your selected sources"
  },
  {
   "id": "planning",
   "label": "Planning research",
   "status": "complete",
   "detail": "4 research directions planned"
  },
  {
   "id": "searching",
   "label": "Searching sources",
   "status": "complete",
   "detail": "12 sources found"
  },
  {
   "id": "reading",
   "label": "Reading evidence",
   "status": "complete",
   "detail": "22 evidence passages extracted"
  },
  {
   "id": "retrieving",
   "label": "Retrieving knowledge",
   "status": "skipped",
   "detail": "No private library selected"
  },
  {
   "id": "cross_checking",
   "label": "Cross-checking claims",
   "status": "complete",
   "detail": "10 candidate claims compared across sources"
  },
  {
   "id": "verifying",
   "label": "Verifying evidence",
   "status": "complete",
   "detail": "7 of 10 claims supported"
  },
  {
   "id": "synthesizing",
   "label": "Synthesizing answer",
   "status": "complete",
   "detail": "Report drafted from verified claims"
  },
  {
   "id": "citing",
   "label": "Attaching citations",
   "status": "complete",
   "detail": "4 sources cited"
  }
 ],
 "sources": [
  {
   "id": "fb3c2b6e-39ef-4543-b702-bbd0afb85464",
   "title": "Lighthouse - Wikipedia",
   "domain": "en.wikipedia.org",
   "url": "https://en.wikipedia.org/wiki/Lighthouse",
   "publisher": "en.wikipedia.org",
   "authors": [],
   "publishedAt": null,
   "type": "web",
   "relevance": 0.884,
   "doi": null,
   "abstract": null
  },
  {
   "id": "b04623ea-93ca-4271-a9a9-5f1bcd5df9db",
   "title": "The History of the Lighthouse | Great Lighthouses of Ireland",
   "domain": "greatlighthouses.com",
   "url": "https://www.greatlighthouses.com/stories/the-history-of-the-lighthouse",
   "publisher": "greatlighthouses.com",
   "authors": [],
   "publishedAt": null,
   "type": "web",
   "relevance": 0.787,
   "doi": null,
   "abstract": null
  },
  {
   "id": "2b6adbf2-8206-4357-8ee5-3862deef4f16",
   "title": "Important Dates in United States Lighthouse History",
   "domain": "foghornpublishing.com",
   "url": "https://www.foghornpublishing.com/history.cfm",
   "publisher": "foghornpublishing.com",
   "authors": [],
   "publishedAt": null,
   "type": "web",
   "relevance": 0.83,
   "doi": null,
   "abstract": null
  },
  {
   "id": "11bdb07a-683d-48b3-a06e-6c50fc13e066",
   "title": "What fuel sources did U.S. lighthouses use in 1917?",
   "domain": "facebook.com",
   "url": "https://www.facebook.com/groups/468285883233890/posts/5726197024109390",
   "publisher": "facebook.com",
   "authors": [],
   "publishedAt": null,
   "type": "web",
   "relevance": 0.614,
   "doi": null,
   "abstract": null
  },
  {
   "id": "d70e285a-34af-401c-a50c-71c10b415fe3",
   "title": "Lighthouse Lamps Through Time by Thomas Tag | United States Lighthouse Society",
   "domain": "uslhs.org",
   "url": "https://uslhs.org/node/1590",
   "publisher": "uslhs.org",
   "authors": [],
   "publishedAt": null,
   "type": "web",
   "relevance": 0.858,
   "doi": null,
   "abstract": null
  },
  {
   "id": "ccbd192a-9d92-468e-82f1-dd0826598f28",
   "title": "First Electric Lighthouse | Isle of May National Nature Reserve",
   "domain": "isleofmaynnr.wordpress.com",
   "url": "https://isleofmaynnr.wordpress.com/2019/01/15/first-electric-lighthouse",
   "publisher": "isleofmaynnr.wordpress.com",
   "authors": [],
   "publishedAt": null,
   "type": "web",
   "relevance": 0.808,
   "doi": null,
   "abstract": null
  },
  {
   "id": "16c0c67c-a7cf-4cc1-832c-bf8f2c55f409",
   "title": "Lighthouse Technology: Illumination - St Augustine Lighthouse & Maritime Museum",
   "domain": "staugustinelighthouse.org",
   "url": "https://www.staugustinelighthouse.org/2016/01/20/lighthouse-technology-illumination",
   "publisher": "staugustinelighthouse.org",
   "authors": [],
   "publishedAt": null,
   "type": "web",
   "relevance": 0.763,
   "doi": null,
   "abstract": null
  },
  {
   "id": "85f0a7c6-12e7-4027-829a-11f7b0f5aa2d",
   "title": "Lamps of the Lighthouse",
   "domain": "pointprimlighthouse.com",
   "url": "https://pointprimlighthouse.com/lamps-of-the-lighthouse",
   "publisher": "pointprimlighthouse.com",
   "authors": [],
   "publishedAt": null,
   "type": "web",
   "relevance": 0.73,
   "doi": null,
   "abstract": null
  },
  {
   "id": "28102077-77b8-46fe-963d-463a08b38c5a",
   "title": "Lighthouse Technology | Minnesota Historical Society",
   "domain": "mnhs.org",
   "url": "https://www.mnhs.org/splitrock/learn/technology",
   "publisher": "mnhs.org",
   "authors": [],
   "publishedAt": null,
   "type": "web",
   "relevance": 0.638,
   "doi": null,
   "abstract": null
  },
  {
   "id": "1d39c471-9120-40ad-a6f2-45cee3b39525",
   "title": "The History of the Kerosene Lamp - University Museums",
   "domain": "museums.iastate.edu",
   "url": "https://museums.iastate.edu/news/history-kerosene-lamp",
   "publisher": "museums.iastate.edu",
   "authors": [],
   "publishedAt": null,
   "type": "web",
   "relevance": 0.591,
   "doi": null,
   "abstract": null
  },
  {
   "id": "7843895a-c06b-46a9-9b02-c8b875d0a245",
   "title": "Lighthouse Oil Myths & Folklore - Ponce Inlet Lighthouse",
   "domain": "ponceinlet.org",
   "url": "https://www.ponceinlet.org/lighthouse-oil-myths-folklore",
   "publisher": "ponceinlet.org",
   "authors": [],
   "publishedAt": null,
   "type": "web",
   "relevance": 0.554,
   "doi": null,
   "abstract": null
  },
  {
   "id": "3d581e9e-82eb-48f5-a872-efbca63ce29b",
   "title": "KEROSENE to EUR: Kerosene Price in Euro | CoinGecko",
   "domain": "coingecko.com",
   "url": "https://www.coingecko.com/en/coins/kerosene/eur",
   "publisher": "coingecko.com",
   "authors": [],
   "publishedAt": null,
   "type": "web",
   "relevance": 0.303,
   "doi": null,
   "abstract": null
  }
 ],
 "sourceIds": [
  "fb3c2b6e-39ef-4543-b702-bbd0afb85464",
  "b04623ea-93ca-4271-a9a9-5f1bcd5df9db",
  "2b6adbf2-8206-4357-8ee5-3862deef4f16",
  "11bdb07a-683d-48b3-a06e-6c50fc13e066",
  "d70e285a-34af-401c-a50c-71c10b415fe3",
  "ccbd192a-9d92-468e-82f1-dd0826598f28",
  "16c0c67c-a7cf-4cc1-832c-bf8f2c55f409",
  "85f0a7c6-12e7-4027-829a-11f7b0f5aa2d",
  "28102077-77b8-46fe-963d-463a08b38c5a",
  "1d39c471-9120-40ad-a6f2-45cee3b39525",
  "7843895a-c06b-46a9-9b02-c8b875d0a245",
  "3d581e9e-82eb-48f5-a872-efbca63ce29b"
 ],
 "evidence": [
  {
   "id": "ecbc6249-7dbe-4494-950d-ddbb9ab48242",
   "sourceId": "85f0a7c6-12e7-4027-829a-11f7b0f5aa2d",
   "passage": "The light was converted from kerosene vapour to automatic electric on March 10, 1969. The polygonal cupola now housed the4th Order Fresnel Lens and a",
   "relevance": 0.663,
   "location": null
  },
  {
   "id": "6beca568-ca86-44d7-9b81-ba5376a95093",
   "sourceId": "28102077-77b8-46fe-963d-463a08b38c5a",
   "passage": "The kerosene, vaporized by being passed over a Bunsen flame, created a light dramatically [...] More than a century before the Split Rock Lighthouse was built, U.S. lighthouses had begun to revolve their lights. At the time, the lights were composed of a variable number of wick-based oil lamps, and revolving them produced regular flashing signals.",
   "relevance": 0.638,
   "location": null
  },
  {
   "id": "e4671b47-4096-49c4-b581-48865ae0a855",
   "sourceId": "16c0c67c-a7cf-4cc1-832c-bf8f2c55f409",
   "passage": "The fuel also known as mineral oil remained the standard for the nation’s lighthouses until the introduction of available electricity. Several lighthouses converted to an electric light source before 1900; yet the St.",
   "relevance": 0.637,
   "location": null
  },
  {
   "id": "14a3e8b3-58bf-4a77-aa7b-7da013fea802",
   "sourceId": "fb3c2b6e-39ef-4543-b702-bbd0afb85464",
   "passage": "South Foreland Lighthouse was the first tower to successfully use an electric light in 1875. The lighthouse's carbon arc lamps were powered by a steam-driven magneto \"Magneto (generator)\").",
   "relevance": 0.626,
   "location": null
  },
  {
   "id": "a7c59c50-5841-4554-8f2e-3a45a4fa8b70",
   "sourceId": "11bdb07a-683d-48b3-a06e-6c50fc13e066",
   "passage": "In 1877, kerosene became the primary fuel for lighthouses, replacing various fuels such as Colza oil, rapeseed oil and lard oil.",
   "relevance": 0.614,
   "location": null
  },
  {
   "id": "f3d2dc1e-6f21-41d8-a0ef-36ef0d255b67",
   "sourceId": "b04623ea-93ca-4271-a9a9-5f1bcd5df9db",
   "passage": "Kerosene and paraffin were widely used in Ireland to fuel the light, prior to the introduction of electrification here in the 1930s. Donaghadee Lighthouse in County Down was the first lighthouse to go electric on the island of Ireland in 1934.",
   "relevance": 0.604,
   "location": null
  },
  {
   "id": "89e3e548-06d0-4c3d-ad48-a6b606c25ccd",
   "sourceId": "1d39c471-9120-40ad-a6f2-45cee3b39525",
   "passage": "Kerosene lamps were used throughout the 19th century as gas lighting was namely reserved for the wealthy and electric lighting was just catching on in rural areas by the late 1800's. Even after electrification, people retained their glass kerosene lamps for emergency uses.",
   "relevance": 0.591,
   "location": null
  },
  {
   "id": "1d1d7ddf-7ef7-4566-8054-bb8afe593b91",
   "sourceId": "fb3c2b6e-39ef-4543-b702-bbd0afb85464",
   "passage": "John Richardson Wigham was the first to develop a system for gas illumination of lighthouses. His improved gas 'crocus' burner at the Baily Lighthouse in county Dublin, Ireland, near Dublin city was 13 times more powerful than the most brilliant light then known. [...] Souter Lighthouse was the first lighthouse to be built for the purpose of electric illumination in 1871. [...] Alexander Mitchell \"Alexander Mitchell (engineer)\") designed the first screw-pile lighthouse – his lighthouse was built on piles that were screwed into the sandy or muddy seabed.",
   "relevance": 0.566,
   "location": null
  },
  {
   "id": "f2db64f4-f103-4ef0-b521-72c90abf437a",
   "sourceId": "16c0c67c-a7cf-4cc1-832c-bf8f2c55f409",
   "passage": "Daniels had completed “the electrification of the tower light” with an “electric bulb of 1,000 watts,” which is the same intensity we use today. The electrification of the lighthouse made the Second Assistant Keeper unnecessary and led to the elimination of the position. [...] Although many may consider the lighthouse’s oil lantern more “authentic” than the electric bulb, it is interesting to note that the lighthouse has been electrified longer than it was illuminated by oil.",
   "relevance": 0.56,
   "location": null
  },
  {
   "id": "83090a46-c32c-4257-a376-8e627deb6023",
   "sourceId": "d70e285a-34af-401c-a50c-71c10b415fe3",
   "passage": "Unfortunately the underwater power cables kept breaking and the project was finally abandoned in 1903. The electric light was first installed in an American lighthouse at Navesink in 1898. [...] The electric-arc lamp was officially installed at Dungeness, England (old tower) in 1862, a Serrin lamp was first used in France at the Cape La Heve lighthouse in 1863, and other installations soon followed.",
   "relevance": 0.548,
   "location": null
  },
  {
   "id": "3aac1db1-9d9f-4353-bd19-456b4a01d364",
   "sourceId": "28102077-77b8-46fe-963d-463a08b38c5a",
   "passage": "The resulting beacon, officially visible for 22 miles, was claimed to have been seen by fishermen as far away as Grand Marais, more than 60 miles away. When the lightstation and fog signal were electrified in 1940, the kerosene vapor lamp was retired and replaced by a 1,000 watt light bulb. ## The fog signal Audible fog signals have been used for hundreds of years, in forms as varied as bells and gongs, steam-powered whistles, and cannons, guns, and other explosives. [...] When oil vapor lamps — still a relatively new innovation in 1910 — were installed at Split Rock, the light became one of the most powerful beacons shining on the Great Lakes.",
   "relevance": 0.541,
   "location": null
  },
  {
   "id": "e2524cbe-70d8-4e4d-8c02-7be52efd0fff",
   "sourceId": "2b6adbf2-8206-4357-8ee5-3862deef4f16",
   "passage": "1886 - The Statue of Liberty was second lighthouse to utilize electricity to become the first \"permanently\" electrified lighthouse in the United States. 1898 - All seacoast lighthouses were turned off for the first time in history as a precaution during the Spanish-American War.",
   "relevance": 0.531,
   "location": null
  },
  {
   "id": "629d00f6-8f0a-48ad-aa81-33ece318147c",
   "sourceId": "d70e285a-34af-401c-a50c-71c10b415fe3",
   "passage": "The Lighthouse Board reported that the lightship operated in a highly satisfactory manner when deployed. Tests were also run on the electric light at Hallet’s Point NY, known as the Hell Gate electric light. [...] The first electrically lit light in America was the Statue of Liberty in 1886.",
   "relevance": 0.529,
   "location": null
  },
  {
   "id": "18b98b23-d285-4767-90e8-a48d1e803240",
   "sourceId": "ccbd192a-9d92-468e-82f1-dd0826598f28",
   "passage": "Looking through the history certain dates stick out and in 1843 the original fixed beam light was replaced by a revolving flash operated from oil but in 1885 that all changed. Work began to alter the light to operate on electricity and on the 1st December 1886, the Isle of May lighthouse became the first lighthouse in Scotland to be powered by this form of energy. [...] 3 Tuesday 15th January comments: The year 1816 was a significant year for the Isle of May as the new lighthouse designed and constructed by Robert Stevenson became fully operational.",
   "relevance": 0.515,
   "location": null
  },
  {
   "id": "414421a2-c1f8-433a-8c9f-a9270c0e6ab2",
   "sourceId": "2b6adbf2-8206-4357-8ee5-3862deef4f16",
   "passage": "The first use of electricity to light a Fresnel lens at a lighthouse in the United States took place on June 30, 1898 at the Navesink Light Station in Highlands, New Jersey. First wireless message sent from ship to shore was from the San Francisco Lightship.",
   "relevance": 0.514,
   "location": null
  },
  {
   "id": "d62375fe-8f02-4bc4-a567-cb5d499e8612",
   "sourceId": "7843895a-c06b-46a9-9b02-c8b875d0a245",
   "passage": "The Ponce Inlet lantern room’s Fresnel lens now uses a modern, 1000-watt, seven-inch long halogen EGM lamp, rather than the bulky 1000-watt incandescent bulb when we first electrified in 1933. Prior to that, the Mosquito/Ponce Inlet Lighthouse depended on a live-fire, five wick, kerosene lamp, the type we’ve just been discussing, to illuminate the huge First-Order Fixed Fresnel Lens in the lantern room.",
   "relevance": 0.499,
   "location": null
  },
  {
   "id": "490d4942-6891-42f9-859d-61e869a43eb3",
   "sourceId": "b04623ea-93ca-4271-a9a9-5f1bcd5df9db",
   "passage": "Built around 280 BC, the source of light was a huge open fire at its summit. As well as being the world’s first, it was also the tallest one ever built, standing a colossal 450 feet high. [...] Great Light for a stunning example) until the invention of the electric light bulb towards the end of the 19th century.",
   "relevance": 0.486,
   "location": null
  },
  {
   "id": "c1878d56-07d2-4ed9-89fe-846443394e50",
   "sourceId": "7843895a-c06b-46a9-9b02-c8b875d0a245",
   "passage": "The “magical” prisms in the lens, then, would and do work best to refract and reflect the light. Of course, the keeper had to carefully clean the soot from the interior and exterior of glass chimney, and the prisms, due to the use of kerosene which did produce some soot, periodically trim the wicks of [...] trim the wicks of carbon to get a cleaner burn, apply glycerin to the exterior glass of the lantern room in freezing climates (fortunately not here in Florida), maintain the correct amount of oil in the lamp, and follow the instructions on how to do it, to a “T.” Lives depended on ships seeing the light and correcting or maintaining their course accordingly.",
   "relevance": 0.485,
   "location": null
  },
  {
   "id": "8f1d898f-f944-4c88-9288-60ad6ba07b79",
   "sourceId": "1d39c471-9120-40ad-a6f2-45cee3b39525",
   "passage": "The collection also includes the Victorian era glass kerosene lamp pictured in a radiant and unique bright blue color.",
   "relevance": 0.473,
   "location": null
  },
  {
   "id": "a5c94a4b-6bda-44e3-9f90-bcee39911074",
   "sourceId": "ccbd192a-9d92-468e-82f1-dd0826598f28",
   "passage": "As with all lighthouses, many stories followed and the isle of May Stevenson lighthouse was no different…",
   "relevance": 0.466,
   "location": null
  },
  {
   "id": "bc3b06a3-54f4-449e-9c17-e4a9f0caa254",
   "sourceId": "3d581e9e-82eb-48f5-a872-efbca63ce29b",
   "passage": "Login [...] XAU Gold - Troy Ounce Select Language Popular Languages EN English RU Русский DE Deutsch PL język polski ES Español VI Tiếng việt FR Français PT-BR Português All Languages AR العربية BG български CS čeština DA dansk EL Ελληνικά FI suomen kieli HE עִבְרִית HI हिंदी HR hrvatski HU Magyar nyelv ID Bahasa Indonesia IT Italiano JA 日本語 KO 한국어 LT lietuvių kalba NL Nederlands NO norsk RO",
   "relevance": 0.303,
   "location": null
  },
  {
   "id": "efae25a0-51fe-491a-aa7d-2ff6ffa98587",
   "sourceId": "3d581e9e-82eb-48f5-a872-efbca63ce29b",
   "passage": "Czech Koruna DKK Danish Krone GBP British Pound Sterling GEL Georgian Lari HKD Hong Kong Dollar HUF Hungarian Forint ILS Israeli New Shekel INR Indian Rupee KWD Kuwaiti Dinar LKR Sri Lankan Rupee MMK Burmese Kyat MXN Mexican Peso MYR Malaysian Ringgit NGN Nigerian Naira NOK Norwegian Krone NZD New Zealand Dollar PHP Philippine Peso PKR Pakistani Rupee PLN Polish Zloty SAR Saudi Riyal SEK Swedish Krona SGD [...] NO norsk RO Limba română SK slovenský jazyk SL slovenski jezik SV Svenska TH ภาษาไทย TR Türkçe UK украї́нська мо́ва ZH 简体中文 ZH-TW 繁體中文 Welcome to CoinGecko Welcome back! Login or Sign up in seconds .",
   "relevance": 0.278,
   "location": null
  }
 ],
 "claims": [
  {
   "id": "764f021a-e59d-4882-9a25-9ab28691024d",
   "text": "The light was converted from kerosene vapour to automatic electric on March 10, 1969.",
   "status": "supported",
   "confidence": 0.8,
   "sourceIds": [
    "85f0a7c6-12e7-4027-829a-11f7b0f5aa2d"
   ],
   "evidenceIds": [
    "ecbc6249-7dbe-4494-950d-ddbb9ab48242"
   ]
  },
  {
   "id": "92812e31-258f-4835-bb67-6d132b9b5af8",
   "text": "South Foreland Lighthouse was the first tower to successfully use an electric light in 1875.",
   "status": "supported",
   "confidence": 0.75,
   "sourceIds": [
    "fb3c2b6e-39ef-4543-b702-bbd0afb85464"
   ],
   "evidenceIds": [
    "14a3e8b3-58bf-4a77-aa7b-7da013fea802"
   ]
  },
  {
   "id": "36e371ea-0552-49fd-bcc1-f04688bdfcbf",
   "text": "Kerosene became the primary fuel for lighthouses, replacing various fuels such as Colza oil, rapeseed oil and lard oil.",
   "status": "supported",
   "confidence": 0.83,
   "sourceIds": [
    "11bdb07a-683d-48b3-a06e-6c50fc13e066"
   ],
   "evidenceIds": [
    "a7c59c50-5841-4554-8f2e-3a45a4fa8b70"
   ]
  },
  {
   "id": "dfca7414-93b0-43ac-b852-ab0916a34eab",
   "text": "Donaghadee Lighthouse in County Down was the first lighthouse to go electric on the island of Ireland in 1934.",
   "status": "supported",
   "confidence": 0.73,
   "sourceIds": [
    "b04623ea-93ca-4271-a9a9-5f1bcd5df9db"
   ],
   "evidenceIds": [
    "f3d2dc1e-6f21-41d8-a0ef-36ef0d255b67"
   ]
  },
  {
   "id": "0ee2f1b9-91bb-41f0-9b33-3e4c21ecc0ef",
   "text": "The first use of electricity to light a Fresnel lens at a lighthouse in the United States took place on June 30, 1898 at the Navesink Light Station in Highlands, New Jersey.",
   "status": "supported",
   "confidence": 0.78,
   "sourceIds": [
    "2b6adbf2-8206-4357-8ee5-3862deef4f16"
   ],
   "evidenceIds": [
    "414421a2-c1f8-433a-8c9f-a9270c0e6ab2"
   ]
  },
  {
   "id": "631853a2-4eff-454e-8030-e4eca093da7d",
   "text": "The Ponce Inlet lantern room’s Fresnel lens now uses a modern, 1000-watt, seven-inch long halogen EGM lamp.",
   "status": "supported",
   "confidence": 0.7,
   "sourceIds": [
    "7843895a-c06b-46a9-9b02-c8b875d0a245"
   ],
   "evidenceIds": [
    "d62375fe-8f02-4bc4-a567-cb5d499e8612"
   ]
  },
  {
   "id": "32aef4f8-0b80-44af-ad4a-f3452111d3a3",
   "text": "Built around 280 BC, the source of light was a huge open fire at its summit.",
   "status": "partially_supported",
   "confidence": 0.57,
   "sourceIds": [
    "b04623ea-93ca-4271-a9a9-5f1bcd5df9db"
   ],
   "evidenceIds": [
    "490d4942-6891-42f9-859d-61e869a43eb3"
   ]
  },
  {
   "id": "98ba508b-a4b1-4e8a-88f8-d27d14cceea1",
   "text": "The first electrically lit light in America was the Statue of Liberty in 1886.",
   "status": "supported",
   "confidence": 0.68,
   "sourceIds": [
    "d70e285a-34af-401c-a50c-71c10b415fe3"
   ],
   "evidenceIds": [
    "629d00f6-8f0a-48ad-aa81-33ece318147c"
   ]
  },
  {
   "id": "30e905ec-191b-498c-be94-8678ed6b007a",
   "text": "The Isle of May lighthouse became the first lighthouse in Scotland to be powered by electricity on December 1, 1886.",
   "status": "partially_supported",
   "confidence": 0.53,
   "sourceIds": [
    "ccbd192a-9d92-468e-82f1-dd0826598f28"
   ],
   "evidenceIds": [
    "18b98b23-d285-4767-90e8-a48d1e803240"
   ]
  },
  {
   "id": "56ca6bfa-ac4f-49c5-a50b-a918a29bf574",
   "text": "The resulting beacon was officially visible for 22 miles.",
   "status": "insufficient_evidence",
   "confidence": 0.28,
   "sourceIds": [
    "28102077-77b8-46fe-963d-463a08b38c5a"
   ],
   "evidenceIds": [
    "3aac1db1-9d9f-4353-bd19-456b4a01d364"
   ]
  }
 ],
 "report": {
  "summary": [
   "Lighthouses transitioned from kerosene lamps to electric light over several decades, with the process beginning in the late 19th century. The first lighthouse to use an electric light was South Foreland Lighthouse in 1875 [1], followed by Donaghadee Lighthouse in Ireland in 1934 [2]. Kerosene became the primary fuel for lighthouses, replacing earlier options like Colza oil and rapeseed oil. The transition to electric lighting was gradual, with the first use of electricity at a U.S. lighthouse occurring in 1898 at Navesink Light Station [3]."
  ],
  "findings": [
   {
    "title": "First Electric Lighthouse",
    "body": "South Foreland Lighthouse in 1875 was the first tower to successfully use an electric light [1]. This marked a significant advancement in lighthouse technology, providing brighter and more reliable illumination.",
    "claimIds": [
     "92812e31-258f-4835-bb67-6d132b9b5af8"
    ]
   }
  ],
  "analysis": [
   {
    "heading": "Fuel Transition",
    "paragraphs": [
     "Kerosene became the primary fuel for lighthouses, replacing various earlier options such as Colza oil, rapeseed oil, and lard oil [4]. This transition was driven by the need for a more efficient and longer-lasting light source."
    ]
   }
  ],
  "limitations": [
   "The report relies on historical evidence from specific locations and dates. The transition to electric lighting varied across different regions and countries, and not all lighthouses converted at the same time or in the same manner.",
   "Pramaan couldn't find enough reliable evidence to support 1 candidate claim; they are excluded from the findings."
  ],
  "citations": [
   {
    "index": 1,
    "sourceId": "fb3c2b6e-39ef-4543-b702-bbd0afb85464"
   },
   {
    "index": 2,
    "sourceId": "b04623ea-93ca-4271-a9a9-5f1bcd5df9db"
   },
   {
    "index": 3,
    "sourceId": "2b6adbf2-8206-4357-8ee5-3862deef4f16"
   },
   {
    "index": 4,
    "sourceId": "11bdb07a-683d-48b3-a06e-6c50fc13e066"
   }
  ]
 },
 "followUps": [],
 "progress": 1.0
} as unknown as ResearchDTO;

/** "When was the Veltrani Lighthouse converted to electricity, and who kept it?" — answered from the uploaded document. */
export const DEMO_GROUNDED = {
 "id": "480f3c68-eeaf-4729-92ed-cd82dc67eebc",
 "title": "When was the Veltrani Lighthouse converted to electricity, and who kept it",
 "query": "When was the Veltrani Lighthouse converted to electricity, and who kept it?",
 "mode": "standard",
 "channels": [
  "web",
  "academic",
  "project"
 ],
 "projectId": null,
 "status": "completed",
 "createdAt": "2026-10-01T08:06:55.969593Z",
 "completedAt": "2026-10-01T08:08:41.188126Z",
 "saved": false,
 "visibility": "private",
 "shareId": null,
 "metrics": {
  "sources": 1,
  "evidence": 2,
  "candidateClaims": 9,
  "verifiedClaims": 5
 },
 "errorCode": null,
 "steps": [
  {
   "id": "understanding",
   "label": "Understanding question",
   "status": "complete",
   "detail": "Identified the question and scope — researching within your project"
  },
  {
   "id": "planning",
   "label": "Planning research",
   "status": "complete",
   "detail": "4 research directions planned"
  },
  {
   "id": "searching",
   "label": "Searching sources",
   "status": "complete",
   "detail": "15 sources found"
  },
  {
   "id": "reading",
   "label": "Reading evidence",
   "status": "complete",
   "detail": "2 evidence passages extracted"
  },
  {
   "id": "retrieving",
   "label": "Retrieving knowledge",
   "status": "complete",
   "detail": "1 relevant passage from 1 document"
  },
  {
   "id": "cross_checking",
   "label": "Cross-checking claims",
   "status": "complete",
   "detail": "9 candidate claims compared across sources"
  },
  {
   "id": "verifying",
   "label": "Verifying evidence",
   "status": "complete",
   "detail": "5 of 9 claims supported"
  },
  {
   "id": "synthesizing",
   "label": "Synthesizing answer",
   "status": "complete",
   "detail": "Report drafted from verified claims"
  },
  {
   "id": "citing",
   "label": "Attaching citations",
   "status": "complete",
   "detail": "1 sources cited"
  }
 ],
 "sources": [
  {
   "id": "2b17be61-cb72-4f23-a8de-eb4b98bba986",
   "title": "Veltrani field notes",
   "domain": "Your library",
   "url": "/library/9e202030-98dd-4cf7-a2cc-94ea71376bb1",
   "publisher": "Your library",
   "authors": [],
   "publishedAt": null,
   "type": "library",
   "relevance": 0.586,
   "doi": null,
   "abstract": null
  }
 ],
 "sourceIds": [
  "2b17be61-cb72-4f23-a8de-eb4b98bba986"
 ],
 "evidence": [
  {
   "id": "706fd906-3c6a-42ba-944d-ec1b5318aa20",
   "sourceId": "2b17be61-cb72-4f23-a8de-eb4b98bba986",
   "passage": "Veltrani Lighthouse — field notes The Veltrani Lighthouse was completed in 1887 on Oskar Rock, at the mouth of the Veltrani estuary. Its lamp was first powered by kerosene and was converted to electricity in 1931, when a cable was laid from the mainland.",
   "relevance": 0.586,
   "location": null
  },
  {
   "id": "b00a6208-7f54-46e0-89e3-71d4004164f9",
   "sourceId": "2b17be61-cb72-4f23-a8de-eb4b98bba986",
   "passage": "The lighthouse keeper Mara Ilves recorded 412 ships passing the light in its first winter after electrification. Keeper rotations were shortened after 1931 because the lamp no longer needed refuelling through the night.",
   "relevance": 0.445,
   "location": null
  }
 ],
 "claims": [
  {
   "id": "322a1359-a480-4802-840f-af1d9262c7c4",
   "text": "The Veltrani Lighthouse was completed in 1887.",
   "status": "supported",
   "confidence": 0.8,
   "sourceIds": [
    "2b17be61-cb72-4f23-a8de-eb4b98bba986"
   ],
   "evidenceIds": [
    "706fd906-3c6a-42ba-944d-ec1b5318aa20"
   ]
  },
  {
   "id": "3b1f56b9-8dad-4993-aed3-1db27546043b",
   "text": "The lighthouse's lamp was initially powered by kerosene.",
   "status": "supported",
   "confidence": 0.8,
   "sourceIds": [
    "2b17be61-cb72-4f23-a8de-eb4b98bba986"
   ],
   "evidenceIds": [
    "706fd906-3c6a-42ba-944d-ec1b5318aa20"
   ]
  },
  {
   "id": "594bd17b-09bb-4c40-9ac7-4c31335afb59",
   "text": "The Veltrani Lighthouse was converted to electricity in 1931.",
   "status": "supported",
   "confidence": 0.8,
   "sourceIds": [
    "2b17be61-cb72-4f23-a8de-eb4b98bba986"
   ],
   "evidenceIds": [
    "706fd906-3c6a-42ba-944d-ec1b5318aa20"
   ]
  },
  {
   "id": "e2235a64-ff8e-42b8-89e0-f7b9eb58c553",
   "text": "A cable was laid from the mainland to power the lighthouse in 1931.",
   "status": "supported",
   "confidence": 0.8,
   "sourceIds": [
    "2b17be61-cb72-4f23-a8de-eb4b98bba986"
   ],
   "evidenceIds": [
    "706fd906-3c6a-42ba-944d-ec1b5318aa20"
   ]
  },
  {
   "id": "c5d605ad-92ad-41e5-b73c-292d9b3517ec",
   "text": "412 ships passed the light in its first winter after electrification.",
   "status": "partially_supported",
   "confidence": 0.6,
   "sourceIds": [
    "2b17be61-cb72-4f23-a8de-eb4b98bba986"
   ],
   "evidenceIds": [
    "b00a6208-7f54-46e0-89e3-71d4004164f9"
   ]
  },
  {
   "id": "c2fc8b89-be97-4fa0-a34a-b3e5e3453f80",
   "text": "Keeper rotations were shortened after 1931.",
   "status": "partially_supported",
   "confidence": 0.6,
   "sourceIds": [
    "2b17be61-cb72-4f23-a8de-eb4b98bba986"
   ],
   "evidenceIds": [
    "b00a6208-7f54-46e0-89e3-71d4004164f9"
   ]
  },
  {
   "id": "166cc8ed-ebf5-46ba-8ba4-32589dd6c00e",
   "text": "The lamp no longer needed refuelling through the night after 1931.",
   "status": "partially_supported",
   "confidence": 0.6,
   "sourceIds": [
    "2b17be61-cb72-4f23-a8de-eb4b98bba986"
   ],
   "evidenceIds": [
    "b00a6208-7f54-46e0-89e3-71d4004164f9"
   ]
  },
  {
   "id": "971849b0-0e54-4a09-818b-c07c495afb5f",
   "text": "Mara Ilves was a lighthouse keeper.",
   "status": "partially_supported",
   "confidence": 0.6,
   "sourceIds": [
    "2b17be61-cb72-4f23-a8de-eb4b98bba986"
   ],
   "evidenceIds": [
    "b00a6208-7f54-46e0-89e3-71d4004164f9"
   ]
  },
  {
   "id": "c3a14958-2abf-432e-9b75-fd0a3caf1a15",
   "text": "The Veltrani Lighthouse is located on Oskar Rock, at the mouth of the Veltrani estuary.",
   "status": "supported",
   "confidence": 0.8,
   "sourceIds": [
    "2b17be61-cb72-4f23-a8de-eb4b98bba986"
   ],
   "evidenceIds": [
    "706fd906-3c6a-42ba-944d-ec1b5318aa20"
   ]
  }
 ],
 "report": {
  "summary": [
   "The Veltrani Lighthouse, located on Oskar Rock at the mouth of the Veltrani estuary, was completed in 1887 and initially powered by kerosene. In 1931, it was converted to electricity using a cable laid from the mainland [1]. This conversion significantly reduced maintenance requirements, as the lamp no longer needed refuelling through the night [1]. Keeper rotations were also shortened after 1931 [1], and Mara Ilves served as a lighthouse keeper [1]."
  ],
  "findings": [
   {
    "title": "Electrification of Veltrani Lighthouse",
    "body": "The Veltrani Lighthouse was converted to electricity in 1931, using a cable laid from the mainland. This conversion reduced maintenance requirements and shortened keeper rotations [1].",
    "claimIds": [
     "594bd17b-09bb-4c40-9ac7-4c31335afb59",
     "e2235a64-ff8e-42b8-89e0-f7b9eb58c553",
     "c2fc8b89-be97-4fa0-a34a-b3e5e3453f80",
     "166cc8ed-ebf5-46ba-8ba4-32589dd6c00e"
    ]
   }
  ],
  "analysis": [
   {
    "heading": "Impact of Electrification",
    "paragraphs": [
     "The electrification of the Veltrani Lighthouse in 1931 marked a significant improvement in its operational efficiency. By eliminating the need for daily refuelling, the lighthouse could operate continuously without interruption [1]. Additionally, shortened keeper rotations suggest that the new system required less human intervention, potentially leading to increased safety and reliability of navigation [1]."
    ]
   }
  ],
  "limitations": [
   "The report relies on partial support for claims regarding the number of ships passing the light in its first winter after electrification [1] and the specific role of Mara Ilves as a lighthouse keeper [1]. These details, while informative, are not definitively confirmed."
  ],
  "citations": [
   {
    "index": 1,
    "sourceId": "2b17be61-cb72-4f23-a8de-eb4b98bba986"
   }
  ]
 },
 "followUps": [],
 "progress": 1.0
} as unknown as ResearchDTO;

/** The uploaded demo document used by DEMO_GROUNDED (library metadata as returned by the API). */
export const DEMO_DOCUMENT = {
 "title": "Veltrani field notes",
 "kind": "txt",
 "sizeBytes": 478,
 "status": "ready"
} as const;

/** A paper returned by Pramaan's academic search in a production run. */
export const DEMO_PAPER = {
 "id": "405c2eae-589c-4a90-b68c-89183b65ccbf",
 "title": "Panorama of the History of Coastal Protection",
 "domain": "doi.org",
 "url": "https://doi.org/10.2112/03561.1",
 "publisher": "Journal of Coastal Research",
 "authors": [
  "Roger H. Charlier",
  "Marie‐Claire P. S. G. Chaineux",
  "Selim A. Morcos"
 ],
 "publishedAt": "2005-01-01",
 "type": "academic",
 "relevance": 0.446,
 "doi": "10.2112/03561.1",
 "abstract": "Changes of sea-level, retreat of shorelines have occurred throughout geological times. They have taken a special significance since Man has appeared. Man has been simultaneously awed by the sea and attracted by its shores. He has consistently attempted to protect his settlements against the onslaughts of the sea. Coastal defenses can be traced back to remote times. It is probable that dams or walls were erected before the Frisians did, but their “defenses” were described by Pliny, and, jusqu'à preuve du contraire, are considered as the first “dike builders”. Earthen artificial hillocks are the forerunners of stone constructions built to hold back the advances of the sea, particularly when sizeable areas of land were gobbled up by the waters along coasts, but also in estuaries, witness i.e. the Dutch Verdronken Land van Saeftingen. The groins, seawalls, breakwaters and the like proved to be illusory shields, to solve little, but to create new problems. Engineers and scientists tried different approaches, inspired by Nature's own ways, nourishment for instance. Other methods are being honed. They must as well consider the economic and social impacts of coastal erosion. The paper follows the historical evolution of man's attempts to retain his “land”."
} as unknown as SourceDTO;
