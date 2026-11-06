<!--
Listing Prep, step 4 (the MLS sheet) builds from this file.
Source: Sara, 2026-11-06, pulled from the MetroList "Listing Information -
Residential" input screen. Keep MetroList's Field IDs as the storage keys so a
value maps 1:1 to the MLS screen (and later to a direct send).
Do not edit option wording: it must match MetroList's dropdowns exactly.
-->

# MetroList Listing Input — Residential: Field Specification

Pulled from the MetroList "Listing Information - Residential" input screen on Nov 6, 2026. Use this to build an agent-facing intake form that mirrors the MLS input.

## How to read this

- **Req** = required by MetroList (marked * on the MLS screen).
- **Field ID** = the MLS form field name. Keep it as the key in the form's data so values map 1:1 to MLS.
- **Type**: text (max length shown), select (single choice, options listed), textarea, radio, or **multi-check** (pick any that apply).
- **Conditional** = hidden on the MLS screen until a trigger field is answered (noted on each).
- Phone numbers are split into 3 boxes in MLS (area / prefix / line). Dates are entered as MM/DD/YY (max 8 characters).
- Multi-check groups list the option label, then the MLS code in brackets.

---

## 1. Listing Basics

| Field | Req | Type | Field ID | Options / Notes |
|---|---|---|---|---|
| Property Subtype | * | select | Prop_Subtype_0001 | Single Family Residence; 2 Houses on Lot; 3+ Houses on Lot; Condominium; Co-Ownership; Halfplex; Manufactured Home; Mobile Home; Modular; Stock Cooperative; Tenancy in Common; Townhouse; Other |
| ADU/2nd Unit | * | select | ADU2 | Yes; No. If Yes, the 2nd Unit section (section 14) becomes required |
| County | * | select | County_ComboBox | All 58 CA counties plus "Outside California" (main ones: Amador, Calaveras, El Dorado, Sacramento, Placer, San Joaquin, Stanislaus, Tuolumne...) |
| APN | * | text x4 | APN_1, APN_2, APN_3, APN_4 | 3 characters each, format ###-###-###-### |
| Street # | * | text | Street_Number | max 6 |
| Street # Modifier | | text | Street_Number_Modifier | max 8 |
| Direction | | select | Street_Direction | East; North; Northeast; Northwest; South; Southeast; Southwest; West |
| Street Name | * | text | Street_Address | max 30 |
| Suffix | | select | Street_Suffix | Alley; Avenue; Boulevard; Canyon; Center; Circle; Common; Corner; Course; Court; Cove; Creek; Drive; Glen; Grove; Harbor; Heights; Highway; Hills; Island; Isle; Junction; Key; Keys; Knolls; Landing; Lane; Loop; Meadow; Park; Parkway; Pass; Passage; Path; Place; Plaza; Point; Ranch; Ridge; Road; Row; Run; Shores; Square; Street; Terrace; Trail; Valley; View; Village; Vista; Walk; Way |
| Unit # | | text | Unit_Number | max 5 |
| City | * | text | City_Fill_In | max 20 |
| ZIP Code | * | text | Zip_Code + Zip_Plus_4 | 5 + 4 digits |
| Cross Street | * | text | Cross_Street | max 30 |
| Office ID | * | text | Office_MLS_ID | max 50 |
| Agent ID | * | text | Agent_MLS_ID | max 50 |
| Co-Office ID | | text | Co_Office_MLS_ID | max 50 |
| Co-Agent ID | | text | Co_Agent_MLS_ID | max 50 |
| Listing Service | * | select | SERL | Full Service; Limited Service; Entry Only |
| Listing Approved | | select | Approve_Listing | Yes; No (broker approval) |

Conditional (shown only for reciprocal/outside agents): Agent Name (RECIP_Agent_Name, max 30), Office Name (RECIP_Office_Name, max 30), Agent Contact Phone (RECIP_Agent_Phone_Area / _Prefix / _Suffix).

### Special Listing Conditions * (multi-check, up to 5) — prefix SALE
Auction [SALEAUCT]; Release Clause [SALERCLS]; Conservatorship [SALECONS]; Short Sale [SALESHSL]; Housing Assist Program [SALEHAPG]; Subject to Court Confirmation [SALECRTC]; HUD Owned [SALEHUDO]; Subject to Lender Confirmation [SALELNDC]; In Foreclosure [SALEFORC]; Subject to Sale of Buyers Property [SALEBUYC]; Notice Of Default [SALENOTD]; Trust [SALESTRS]; Offer As Is [SALEOFFR]; VA Repo [SALEREPO]; Pending Litigation [SALEPNDL]; None [SALENONE]; Probate Listing [SALEPROB]; Other [SALEOTHR]; Real Estate Owned [SALEREOO]

## 2. Price and Dates

| Field | Req | Type | Field ID | Options / Notes |
|---|---|---|---|---|
| Listing Price | * | text (2 parts) | Listing_Price_1 + Listing_Price_2 | thousands part (max 6) + last 3 digits (max 3) — in the form, use one currency field and split on submit |
| Listing Date | * | date | Listing_Date | MM/DD/YY |
| Expiration Date | * | date | Expiration_Date | MM/DD/YY |
| On Market Date | * | date | OnMarket_Date | MM/DD/YY |

## 3. Showing and Access

### Showing Instructions * (multi-check) — prefix SHOW
24 Hour Notice [SHOWHR24]; Leave Card [SHOWLCRD]; Alarm Code in Lockbox [SHOWALMC]; No Photos Allowed [SHOWNPHT]; Appointment Only [SHOWAPPO]; Pets-See Confidential Remarks [SHOWPETS]; Call 1st Lockbox [SHOWCLBX]; Restricted Hours [SHOWRSTH]; Call Showing Contact [SHOWCSHC]; Security System [SHOWSECS]; CBS Restricted-CLA [SHOWCBSR]; Supra iBox [SHOWLBOX]; Do Not Disturb [SHOWDOND]; Surveillance Equipment In Use [SHOWSEQP]; Do Not Show [SHOWDONS]; Text Showing Contact [SHOWTSHC]; Gate Code Provided [SHOWGCPV]; Vacant [SHOWVCNT]; Gate Code-CLA [SHOWGCOD]; Vacant w/Lockbox [SHOWVLBX]; Go Directly [SHOWGDIR]; See Remarks [SHOWSRMK]; Key In Office [SHOWKYOF]; Other [SHOWOTHR]

| Field | Req | Type | Field ID | Options / Notes |
|---|---|---|---|---|
| Primary Showing Contact Type | * | select | PCTY | Agent; Caretaker; Listing Office; Owner; Property Manager; Tenant; Vacant; Other |
| Primary Showing Contact Name | * | text | 0210PCON | max 40 |
| Primary Showing Contact Phone | * | phone | AREA_PPHO / PHONE1_PPHO / PHONE2_PPHO | |
| Primary Showing Phone Ext | | text | 0230PEXT | max 6 |
| Secondary Showing Contact Type | | select | SSCT | same options as Primary |
| Secondary Showing Contact Name | | text | 0250SSCN | max 40 (conditional on Secondary Type) |
| Secondary Showing Contact Phone | | phone | AREA_SSCP / PHONE1_SSCP / PHONE2_SSCP | conditional on Secondary Type |
| Secondary Showing Phone Ext | | text | 0270SEXT | max 6 (conditional) |
| Lockbox Location | | textarea | 0280LBLO | max 60 characters |
| Gate/Access Code | | text | 0290GATC | max 25 (see MLS Rule 13.12) |
| Occupant Type | * | select | Occupant_Type | Owner; Tenant; Vacant |
| Occupant Name | | text | 0310OCCN | max 40 (conditional, shown when occupied) |
| Occupant Phone | | phone | AREA_OCUP / PHONE1_OCUP / PHONE2_OCUP | conditional |
| Current Rent | | currency | CRNT | max 8 |

## 4. Property Facts

| Field | Req | Type | Field ID | Options / Notes |
|---|---|---|---|---|
| Zoning | * | textarea | 0340ZONG | max 50 characters |
| Census Tract | | text | CNST | max 10 |
| Elevation | | text | AELV | max 5 — feet above sea level of the property, not the home |
| Area/District | * | text | Area_Fill_In | max 60 |
| Approx SqFt | * | number | Struc_Sq_Ft | max 9 |
| SqFt Source | * | select | SqFt_Source | Against Co. Policy; Appraiser; Architect; Assessor Agent-Fill; Assessor Auto-Fill; Broker; Builder; Condo Map; Graphic Artist; Housing Community Development; Measured by Agent; Not Available; Not Verified; Owner; Verified |
| Bedrooms | * | select | Bedrooms_ComboBox | 0–40 |
| Total Possible Bedrooms | | select | Possible_Beds_ComboBox | 0–40 |
| Full Baths | * (at least one bath field) | select | Bathrooms_Full | 0–15 |
| Partial Bathrooms | * (at least one bath field) | select | Bathrooms_Half | 0–15 |
| # of Rooms | | number | NRMS | max 3 |
| Year Built | * | number | Year_Built | 4 digits — OR use Unknown_Year below |
| Year Built (if no year) | | select | Unknown_Year | Against Co. Policy; Build to Suit; Completed Never Occupied; New; Under Construction; Unknown |
| Year Built Source | * | select | YEAR | Appraiser; Assessor Agent-Fill; Assessor Auto-Fill; Builder; Owner; Other |
| Lot Size | * | number | Lot_Sq_Ft | max 9 |
| Lot Size Unit | * | radio | Lot_Measurement | SqFt; Acres |
| Lot Size Source | * | select | LotSize_Source | Against Co. Policy; Appraiser; Architect; Assessor Agent-Fill; Assessor Auto-Fill; Builder; Graphic Artist; Measured by Agent; Not Available; Not Verified; Owner; Verified |
| Lot Size Dimensions | | text | 0470LOTD | max 40 |
| School District (County) | * | text | School_District_Fill_In | max 20 |
| School Type 1 / District | * | select + text | SchoolType1 + School_Code_1 | Elementary School District; Middle or Junior School District; Senior High School District; district name max 20 |
| School Type 2 / District | * | select + text | SchoolType2 + School_Code_2 | same |
| School Type 3 / District | * | select + text | SchoolType3 + School_Code_3 | same |
| Subdivision | | text | 0490SUBV | max 40 |
| Subdivision Developer | | text | 0500SUBD | max 40 |
| Builder Model | | text | 0510MODL | max 40 |
| Builder Name | | text | 0520BLDR | max 40 |
| Property Faces | | select | FACE | East; North; Northeast; Northwest; Southeast; Southwest; South; West |
| Stories | * | number | STOR | max 2 |
| Garage Spaces | * | number | NGSP | max 3 |
| Carport Spaces | | number | NCSP | max 3 |
| Open Parking Spaces | | number | OSSP | max 2 |
| Basement SqFt | | number | BSQF | max 5 |
| # of Fireplaces | * | number | NFRP | max 3 (if 1+, Fireplace Features appears) |
| # of Units | | number | NUNT | max 4 |

## 5. Style and Construction (multi-check groups)

**Subtype Description \*** (TYPE): Attached; Planned Unit Develop; Custom; Ranchette/Country; Detached; Semi-Attached; Flat; Semi-Custom; Full; Studio; Junior; Tract; Live/Work; Low-Rise (1-3); Loft; Mid-Rise (4-8); Luxury; Hi-Rise (9+); Modified

**Architectural Style** (STYL): A-Frame; French; Art Deco; French Normandy; Arts & Crafts; Georgian; Barn Type; Log; Bungalow; Marina; Cabin; Mediterranean; Cape Cod; Mid-Century; Chalet; Modern/High Tech; Colonial; Ranch; Contemporary; Rustic; Conversion; Spanish; Cottage; Traditional; Craftsman; Tudor; Dome; Victorian; Edwardian; Vintage; English; Yurt; Farmhouse; See Remarks; Flat; Other

**Construction Materials \*** (CONS): Adobe; Metal; Aluminum Siding; Metal Siding; Block; Partial Insulation; Brick; Plaster; Brick Veneer; Rammed Earth; Ceiling Insulation; Redwood Siding; Cement Siding; Shingle Siding; Concrete; Stone; Fiber Cement; Straw; Fiberglass Siding; Stucco; Floor Insulation; Vinyl Siding; Frame; Wall Insulation; Glass; Wood; Lap Siding; Wood Siding; Log; See Remarks; Masonry Reinforced; Other; Masonry Unreinforced

**Foundation \*** (FOUN): Block; Masonry Perimeter; Brick/Mortar; Piling; Capped Brick; Pillar/Post/Pier; Combination; Raised; Concrete; Slab; Concrete Grid; See Remarks; Concrete Perimeter; Other

**Roof \*** (ROOF): Bitumen; Shake; Cement; Shingle; Composition; Slate; Elastomeric; Spanish Tile; Fiberglass; Tar/Gravel; Flat; Tile; Foam; Wood; Metal; See Remarks; Rock; Other

**Property Condition** (PCND): Fixer; Under Construction; New Construction; Updated/Remodeled; Original

| Field | Req | Type | Field ID | Options |
|---|---|---|---|---|
| Land Lease | | select | LNDI | Yes; No |
| Remodeled/Updated | * | select | RMDL | Yes; No; Unknown |

**Remodeled/Updated Desc \*** (RMTY, required if Remodeled = Yes): Bath 0-5YR; Bath 6-10YR; Bath 11-15YR; Bed 0-5YR; Bed 6-10YR; Bed 11-15YR; Kitchen 0-5YR; Kitchen 6-10YR; Kitchen 11-15YR; Primary Bath 0-5YR; Primary Bath 6-10YR; Primary Bath 11-15YR; Other-Rmks 0-5YR; Other-Rmks 6-10YR; Other-Rmks 11-15YR

## 6. Views, Parking, Levels (multi-check groups)

**View Description** (VIEW): Bridges; Orchard; Canyon; Panoramic; City; Park; City Lights; Pasture; Downtown; Ridge; Forest; River; Garden/Greenbelt; Valley; Golf Course; Vineyard; Hills; Water; Lake; Woods; Marina; Other; Mountains

**Parking Features \*** (GARG): 1/2 Car Space; No Garage; 24'+ Deep Garage; Permit Required; Alley Access; Plane Port; Assigned; Private; Attached; Restrictions; Boat Dock; Rotational; Boat Storage; RV Access; Converted Garage; RV Garage Attached; Covered; RV Garage Detached; Deck; RV Possible; Detached; RV Storage; Drive Thru Garage; Side-by-Side; Enclosed; Size Limited; EV Charging; Tandem Garage; Garage Door Opener; Unassigned; Garage Facing Front; Uncovered Parking Space; Garage Facing Rear; Uncovered Parking Spaces 2+; Garage Facing Side; Underground Parking; Golf Cart; Valet; Guest Parking Available; Workshop in Garage; Interior Access; See Remarks; Mechanical Lift; Other

**Driveway/Sidewalks** (DRIV): Circular; Paved Driveway; Downslope; Paved Sidewalk; Gated; Shared Driveway; Gentle Down; Sidewalk/Curb/Gutter; Gentle Up; Unpaved; Gravel; Upslope; Level; Varied; Maintenance Agreement

**Location of Unit** (LOCU, conditional — condo/townhouse subtypes): Close to Clubhouse; Top Floor; End Unit; Unit Above; Ground Floor; Unit Below; Lower Level; Upper Level; Penthouse(s); Other

**Levels** (LEVL): One; Two; Three Or More; Multi/Split

**Lower Level** (LOWL): Bedroom(s); Loft; Below Grade; Primary Bedroom; Dining Room; Partial Bath(s); Family Room; Retreat; Full Bath(s); Street Entrance; Garage; Kitchen; Living Room

**Main Level \*** (MAIN): Bedroom(s); Living Room; Dining Room; Loft; Family Room; Primary Bedroom; Full Bath(s); Partial Bath(s); Garage; Retreat; Kitchen; Street Entrance

**Upper Level** (UPRL): Bedroom(s); Living Room; Dining Room; Loft; Family Room; Primary Bedroom; Full Bath(s); Partial Bath(s); Garage; Retreat; Kitchen; Street Entrance

**Basement** (BSTM): Finished; Unfinished; Full; Walk-Out Access; Partial; Walk-Up Access; Partially Finished; None

## 7. Interior (multi-check groups)

**Interior Features** (INTE): Cathedral Ceiling; Open Beam Ceiling; Elevator; Storage Area(s); Formal Entry; Wet Bar

**Room Type** (RMDS): Atrium; Loft; Attic; Primary Bathroom; Baths Other; Primary Bedroom; Bonus Room; Primary Bedrooms 2+; Converted Garage; Media Room; Den; Office; Dining Room; Possible Guest; Family Room; Solarium; Game Room; Storage; Great Room; Studio; Guest Quarters; Sun Room; Home Theater; Temp Controlled Room; In Law Apartment; Wine Cellar; Kitchen; Wine Storage Area; Laundry; Workshop; Library; Other; Living Room

**Living Room Features \*** (LIVR): Cathedral/Vaulted; Skylight(s); Deck Attached; Sunken; Great Room; View; Open Beam Ceiling; Other

**Family Room Features** (FAMR): Cathedral/Vaulted; Skylight(s); Deck Attached; Sunken; Great Room; View; Open Beam Ceiling; Other

**Dining Room Features \*** (DING): Breakfast Nook; Formal Room; Dining Bar; Skylight(s); Dining/Family Combo; Space in Kitchen; Dining/Living Combo; Sunken; Formal Area; Other

**Kitchen Features \*** (KTCH): Breakfast Area; Marble Counter; Breakfast Room; Metal/Steel Counter; Butcher Block Counters; Other Counter; Butlers Pantry; Pantry Cabinet; Ceramic Counter; Pantry Closet; Concrete Counter; Quartz Counter; Dumb Waiter; Skylight(s); Granite Counter; Slab Counter; Island; Stone Counter; Island w/Sink; Synthetic Counter; Kitchen/Family Combo; Tile Counter; Laminate Counter; Wood Counter

**Appliances** (KTAP): Built-In Electric Oven; Free Standing Gas Range; Built-In Electric Range; Free Standing Refrigerator; Built-In Freezer; Gas Cook Top; Built-In Gas Oven; Gas Plumbed; Built-In Gas Range; Gas Water Heater; Built-In Refrigerator; Hood Over Range; Compactor; Ice Maker; Dishwasher; Insulated Water Heater; Disposal; Microwave; Double Oven; Plumbed For Ice Maker; Dual Fuel; Self/Cont Clean Oven; Electric Cook Top; Solar Water Heater; Electric Water Heater; Tankless Water Heater; ENERGY STAR Qualified Appliances; Warming Drawer; Free Standing Electric Oven; Wine Refrigerator; Free Standing Electric Range; See Remarks; Free Standing Freezer; Other; Free Standing Gas Oven

**Primary Bedroom Features** (MSTB): Balcony; Sitting Room; Closet; Surround Sound; Ground Floor; Walk-In Closet; Outside Access; Walk-In Closet 2+; Sitting Area; Wet Bar

**Primary Bathroom Features** (MBTH): Bidet; Sauna; Closet; Shower Stall(s); Double Sinks; Sitting Area; Dual Flush Toilet; Skylight/Solar Tube; Fiberglass; Soaking Tub; Granite; Steam; Jetted Tub; Stone; Low-Flow Shower(s); Sunken Tub; Low-Flow Toilet(s); Tile; Marble; Tub; Multiple Shower Heads; Tub w/Shower Over; Outside Access; Walk-In Closet; Quartz; Walk-In Closet 2+; Radiant Heat; Window

**Bath Features \*** (BTHD): Bidet; Sauna; Closet; Shower Stall(s); Double Sinks; Skylight/Solar Tube; Dual Flush Toilet; Split Bath; Fiberglass; Steam; Granite; Stone; Jack & Jill; Sunken Tub; Jetted Tub; Tile; Low-Flow Shower(s); Tub; Low-Flow Toilet(s); Tub w/Shower Over; Marble; Window; Multiple Shower Heads; None; Outside Access; See Remarks; Quartz; Other; Radiant Heat

**Laundry Features \*** (LNDY): Cabinets; Laundry Closet; Chute; No Hookups; Dryer Included; Sink; Electric; Space For Frzr/Refr; Gas Hook-Up; Stacked Only; Ground Floor; Upper Floor; Hookups Only; Washer Included; In Basement; Washer/Dryer Stacked Included; In Garage; None; In Kitchen; See Remarks; Inside Area; Other; Inside Room

**Flooring \*** (FLOR): Bamboo; Reclaimed; Carpet; Recycled Carpet; Concrete; Simulated Wood; Cork; Slate; Granite; Stamped; Laminate; Stone; Linoleum; Tile; Luxury Vinyl Plank; Vinyl; Marble; Wood; Painted/Stained; See Remarks; Parquet; Other; Quartz

**Window Features** (WINF): Bay Window(s); Skylight Tube; Caulked/Sealed; Solar Screens; Dual Pane Full; Storm Windows; Dual Pane Partial; Triple Pane Full; Greenhouse Window(s); Triple Pane Partial; Low E Glass Full; Weather Stripped; Low E Glass Partial; Window Coverings; Skylight(s); Window Screens

**Fireplace Features** (FRPL, conditional — shown when # of Fireplaces is 1+): Brick; Insert; Circular; Kitchen; Circulating; Living Room; Decorative Only; Primary Bedroom; Den; Metal; Dining Room; Outside; Double Sided; Pellet Stove; Electric; Raised Hearth; Family Room; Stone; Free Standing; Wood Burning; Gas Log; Wood Stove; Gas Piped; See Remarks; Gas Starter; Other

**Accessibility Features** (HNDC): Accessible Approach with Ramp; Lowered Switch(s); Accessible Doors; Parking; Accessible Elevator Installed; Roll-In Shower; Accessible Full Bath; Shower(s); Accessible Kitchen; Wheelchair Access; Flashing Warnings; See Remarks; Grab Bars; Other; Kitchen Cabinets

**Other Equipment** (EQUP): Air Purifier; Home Theater Equipment; Attic Fan(s); Intercom; Audio/Video Prewired; MultiPhone Lines; Central Vac Plumbed; Networked; Central Vacuum; TV Antenna; DC Well Pump; Water Cond Equipment Leased; Dish Antenna; Water Cond Equipment Owned; Dumb Waiter; Water Filter System

**Security Features \*** (SECR): Carbon Mon Detector; Security System Leased; Double Strapped Water Heater; Security System Owned; Fire Alarm; Security System Prewired; Fire Extinguisher; Smoke Detector; Fire Suppression System; Unguarded Gate; Guarded Gate; Video System; Panic Alarm; Window Bars w/Quick Release; Secured Access; Window Security Bars; Security Fence; See Remarks; Security Gate; Other; Security Patrol

## 8. Heating, Cooling, Energy

**Cooling \*** (COOL): Ceiling Fan(s); Smart Vent; Central; Wall Unit(s); Ductless; Whole House Fan; Evaporative Cooler; Window Unit(s); Heat Pump; None; MultiUnits; See Remarks; MultiZone; Other; Room Air

**Heating \*** (HEAT): Baseboard; Pellet Stove; Bio Diesel Furnace; Propane; Central; Propane Stove; Ductless; Radiant; Electric; Radiant Floor; Fireplace Insert; Smart Vent; Fireplace(s); Solar Heating; Floor Furnace; Solar w/Backup; Gas; Steam; Heat Pump; Wall Furnace; Hot Water; Wood Stove; MultiUnits; None; MultiZone; See Remarks; Natural Gas; Other; Oil

**Green Building Verification Type** (BRGC): Certified Passive House; Indoor air PLUS; ENERGY STAR Certified Homes; LEED For Homes; Green Point; Pearl Certification; HERS Index Score; PHIUS+; Home Energy Score; Water Sense; Home Performance with Energy Star; Zero Energy Ready Home

| Field | Req | Type | Field ID | Notes |
|---|---|---|---|---|
| Green Verification Rating | | text | 0880GRRT | max 30 |
| Green Verification Body | | text | 0890GRBW | max 24 |
| Green Verification Year | | text | YRGR | max 4 |

**Energy Efficient** (GREF): Appliances; Insulation; Construction; Lighting; Cooling; Roof; Doors; Thermostat; Exposure/Shade; Water Heater; Heating; Windows

## 9. Exterior and Lot

**Exterior Features** (MISC): Balcony; Kitchen; Built-In Barbeque; Misting System; Covered Courtyard; Uncovered Courtyard; Dog Run; Wet Bar; Fire Pit

**Patio And Porch Features** (PAPO): Awning; Front Porch; Back Porch; Roof Deck; Covered Deck; Uncovered Deck; Covered Patio; Uncovered Patio; Enclosed Deck; Wrap Around Porch; Enclosed Patio

| Field | Req | Type | Field ID | Options |
|---|---|---|---|---|
| Pool | * | select | POOL | Yes; No (Yes shows Pool Features) |
| Spa | | select | SPAA | Yes; No (Yes shows Spa Features) |

**Pool Features** (PTYP, conditional on Pool = Yes): Above Ground; Membership Fee; Built-In; On Lot; Cabana; Pool Cover; Common Facility; Pool House; Dark Bottom; Pool Sweep; Electric Heat; Pool/Spa Combo; Fenced; Possible Pool Site; Fiberglass; Salt Water; Gas Heat; Solar Cover; Gunite Construction; Solar Heat; Heat None; Sport; Indoors; Vinyl Liner; Lap; See Remarks; Liner; Other; Heated

**Spa Features** (SPAF, conditional on Spa = Yes): Spa/Hot Tub Built-In; Spa/Hot Tub Personal; Spa/Hot Tub

**Fencing** (FENC): Back Yard; Metal; Barbed Wire; Partial; Chain Link; Partial Cross; Cross Fenced; Vinyl; Electric; Wire; Entry Gate; Wood; Fenced; None; Front Yard; See Remarks; Full; Other; Masonry

**Other Structures** (OTHS): Barn(s); Pergola; Cave(s); Second Garage; Gazebo; Shed(s); Greenhouse; Storage; Guest House; Workshop; Kennel/Dog Run; Yurt; Outbuilding; Other

**Lot Features \*** (LDES): Adjacent to Golf Course; Manual Sprinkler F&R; Auto Sprinkler F&R; Manual Sprinkler Front; Auto Sprinkler Front; Manual Sprinkler Rear; Auto Sprinkler Rear; Meadow East; Close to Clubhouse; Meadow West; Corner; Navigable Waterway; Court; Pond Seasonal; Cul-De-Sac; Pond Year Round; Curb(s); Private; Curb(s)/Gutter(s); Reservoir; Dead End; River Access; Flag Lot; Secluded; Garden; Shape Irregular; Gated Community; Shape Regular; Grass Artificial; Split Possible; Grass Painted; Storm Drain; Greenbelt; Stream Seasonal; Lake Access; Stream Year Round; Land Locked; Street Lights; Landscape Back; Zero Lot Line; Landscape Front; See Remarks; Landscape Misc; Other; Low Maintenance

**Topography** (STDS): Downslope; Rolling; Forest; Snow Line Above; Hillside; Snow Line Below; Level; South Sloped; Lot Grade Varies; Steep Hill; Lot Sloped; Trees Few; Ridge; Trees Many; Rock Outcropping; Upslope

**Land Use** (FRUS): Agricultural; Plantable; Dairy; Poultry; Farm; Ranch; Fishery; Residential; Livestock; Tree Farm; Logging; Vineyard; Nursery; See Remarks; Orchard; Other; Pasture

**Current Use** (CUSE): Bed & Breakfast; Vacation Rental; Day Care; Vineyard; Senior Care; Winery; Tasting Room

| Field | Req | Type | Field ID | Options |
|---|---|---|---|---|
| Horse Property | * | select | HORS | Yes; No |

**Horse Property Features \*** (HRSP, required if Horse Property = Yes): 1-6 Stalls; Paddocks; 7+ Stalls; Palpation Chute; Arena; Pasture; Barn Amenities; Pens; Barn w/Electricity; Riding Trail; Barn w/Water; Round Pen; Barn(s); Shaving Bin; Boarding Facilities; Stable; Chutes; Tack Room; Corrals; Trailer Storage; Cross Fenced; Wash Rack; Fenced; None; Hay Storage; See Remarks; Hot Walker; Other; Irrigated Pasture; Attached Docs

**Road Responsibility** (RDRE): No Road Maintenance Agreement; Public Maintained Road; Private Maintained Road; Road Maintenance Agreement

**Road Surface Type** (RDSC): Asphalt; Paved; Chip And Seal; Unimproved; Gravel

**Frontage Type** (STLC): Borders Government Land; River; Golf Course; Waterfront; Lakefront

| Field | Req | Type | Field ID | Options |
|---|---|---|---|---|
| Distance To Public Transportation | | select | TRAN | 1 Block; 2 Blocks; 3 Blocks; 4+ Blocks; <1 Mile; 1-2 Miles; 3 or More Miles; On Transit Line; See Remarks; Other |
| Distance To Shopping | | select | SHOP | 1 Block; 2 Blocks; 3 Blocks; 4+ Blocks; On Street |

## 10. Utilities

**Utilities \*** (UTIL): Cable Available; Propane Tank Owned; Cable Connected; Public; Diesel; Sewer Connected; DSL Available; Sewer Connected & Paid; Electric; Sewer In & Connected; Internet Available; Solar; Natural Gas Available; Underground Utilities; Natural Gas Connected; Wind; Off Grid; None; Oil; See Remarks; Propane; Other; Propane Tank Leased

**Electric \*** (ELEC): 3 Phase; Battery Backup; 220 Volts; Generator; 220 Volts in Kitchen; See Remarks; 220 Volts in Laundry; Other; 440 Volts

| Field | Req | Type | Field ID | Options / Notes |
|---|---|---|---|---|
| Power Production Type | | select | PWRT | Photovoltaics; Wind; None |
| Power Production Ownership | | select | PWRO | Seller Owned; Third-Party Owned; Power Purchase Agreement |
| Power Production Year Install | | text | PWRY | max 4 |
| Power Production Size | | text | PWRS | max 8 |

**Power Production Description** (PWRD): Bi-Direct Meter; Solar On Grid; Passive Solar; Solar Panels; Prewired for Solar; Solar Plumbed; Prewired for WinGen; Solar Tube/Chamber; Solar Battery Backup; Wind Turbine(s); Solar Off Grid

**Water Source \*** (WATR): Abandoned Well; Public; Meter Available; Shared Well; Meter on Site; Storage Tank; Meter Paid; Treatment Equipment; Meter Required; Untreated; Mutual Water; Water District; Private; Well; Other; See Remarks

**Irrigation Source \*** (WTRI): Agricultural Well; Private District; Irrigation Available; Public District; Irrigation Connected; Riparian Rights; Irrigation District; Shares Domestic Well; Meter Available; Spring(s); Meter on Site; None; Meter Paid; See Remarks; Meter Required; Other

**Sewer \*** (SEWR): Abandoned Septic; Septic System; Engineered Septic; Sewer in Street; Holding Tank; Shared Septic; Private Sewer; Special System; Public Sewer; None; Septic Connected; See Remarks; Septic Pump; Other

## 11. Restrictions, Disclosures, Zones

**Restrictions** (RSTR): Age Restrictions; Rental(s); Board Approval; Signs; Exterior Alterations; Tree Ordinance; Guests; See Remarks; Owner/Coop Interview; Other; Parking

| Field | Req | Type | Field ID | Options |
|---|---|---|---|---|
| Senior Community | * | select | SENI | Yes; No |

**Pets Allowed** (PETS): Yes; Number Limit; No; Service Animals OK; Cats OK; Size Limit; Dogs OK

**Disclosures/Documents** (DOCU): Acoustical Report; Rental/Lease Agreement; Association Docs; Retrofit Required; Attached Docs; Road Agreement; Boiler Inspection; Roof Inspection; CC&Rs; Seller Property Questionnaire; Disclosure Package Available; Septic Certification; Drainage Report; Sewer or Septic Report; Electrical Report; Soils Report; Energy Audit; Structural Pest Control Report; Environmental Hazards Report; Structural/Eng Report; Estoppel Certificate; TDS Available; Fireplace Inspection; Transfer Disclosure Statement; Furnace Inspection; Underground Tank; Geological Report; Use Permit; Home Inspection Report; Water Agreement; Lead Hazard Disclosure; Water Test Log(s); Lead Inspection Report; Well Report; Mine on Property; Well-Test GPM; Natural Hazard Disclosure Available; Well-Test Potability; Pest Certification Available; None; Pest Control Report Available; See Remarks; Pool Report; Other; Preliminary Title Report

| Field | Req | Type | Field ID | Options / Notes |
|---|---|---|---|---|
| Certified Firewise Community | | select | CTFC | Yes; No; Unknown |
| Firewise Community Name | | textarea | 1402FRCN | max 50 (conditional on Firewise = Yes) |
| Home Warranty | | select | HMPR | Yes; No |

**Special Zones** (SPEZ): Agriculture Preserve; Redevelopment Area; Fire Zone; Scenic Corridor; Flood Insurance Required; Seismic Hazard Zone; Flood Zone; Seismic Zone 4; Hazardous Waste Area; Special Study Zone; Historical; See Attached Docs; Not Mapped; Other; Open Space Corridor; Unknown

## 12. Association (HOA)

| Field | Req | Type | Field ID | Options / Notes |
|---|---|---|---|---|
| Association | * | select | HOAA | Yes; No (Yes reveals the fields below) |
| Association Mandatory | | select | AMAN | Yes; No |
| Association Fee | | currency | HOAD | max 8 |
| Association Fee Frequency | | select | HOAP | Annually; Monthly; Semi-Annual; Quarterly; Semi-Monthly; See Remarks |
| Association Name | | textarea | 1500HOAN | max 50 |
| Association Phone | | phone | AREA_HOPN / PHONE1_HOPN / PHONE2_HOPN | |

**Association Fee Includes** (DUIN, conditional): Cable TV; Organized Activities; Common Areas; Pool; Door Person; Property Tax; Earthquake Insurance; Recreation Facility; Electricity; Road; Elevator; Roof; Gas; Security; Heat; Sewer; Homeowners Insurance; Snow Removal; Insurance; Trash; Insurance on Structure; Water; Internet; None; Maintenance Exterior; See Remarks; Maintenance Grounds; Other; Management

**Association Features** (OTHA, conditional): Barbeque; Playground; Car Wash Area; Pool; Clubhouse; Putting Green(s); Dog Park; Racquetball Court; Exercise Course; Rec Room w/Fireplace; Exercise Court; Recreation Facilities; Exercise Room; Roof Deck; Game Court Exterior; Sauna; Game Court Interior; Spa/Hot Tub; Golf Course; Tennis Courts; Greenbelt; Trails; Gym; Workshop Area; Lake; None; Laundry Coin; See Remarks; Laundry Free; Other; Park; Beach Rights; Common Laundry

## 13. Room Dimensions (all optional, Length x Width, max 6 each)

| Room | Length ID | Width ID |
|---|---|---|
| Primary Bedroom | RoomLength_MBRD | RoomWidth_MBRD |
| Bedroom 2 | RoomLength_BD2D | RoomWidth_BD2D |
| Bedroom 3 | RoomLength_BD3D | RoomWidth_BD3D |
| Bedroom 4 | RoomLength_BD4D | RoomWidth_BD4D |
| Living Room | RoomLength_LVGD | RoomWidth_LVGD |
| Family Room | RoomLength_FMRD | RoomWidth_FMRD |
| Dining Room | RoomLength_DNGD | RoomWidth_DNGD |
| Kitchen | RoomLength_KTCD | RoomWidth_KTCD |

## 14. 2nd Unit / ADU (required when ADU/2nd Unit = Yes)

| Field | Req | Type | Field ID | Options / Notes |
|---|---|---|---|---|
| 2nd Unit Bedrooms | * | select | SNUB | 0–15 |
| 2nd Unit Full Baths | * | select | SUFB | 0–15 |
| 2nd Unit Partial Baths | * | select | SUHB | 0–15 |
| 2nd Unit Kitchen | * | select | SUKT | Yes; No |
| 2nd Unit Private Entry | * | select | SNPE | Yes; No |
| 2nd Unit Occupied | * | select | SUOC | Yes; No |
| 2nd Unit Type | * | select | SUTY | 2nd Unit Attached; 2nd Unit Detached; ADU Attached; ADU Detached |
| 2nd Unit Rents for | | currency | SURT | max 8 |
| 2nd Unit Approx SqFt | * | number | SSQF | max 5 |
| 2nd Unit SqFt Source | * | select | SSQS | Against Co. Policy; Appraiser; Assessor Agent-Fill; Broker; Builder; Measured by Agent; Not Available; Not Verified; Owner |
| 2nd Unit Description | * | text | 1700SUND | max 24 |

## 15. Financial and Terms

| Field | Req | Type | Field ID | Options / Notes |
|---|---|---|---|---|
| Bonds/Assessments/Taxes | * | select | MELO | Yes; Unknown |
| County Transfer Tax Rate | | text | CTTR | max 10 |
| City Transfer Tax Rate | | text | CTTA | max 10 |

**Bonds/Assessments/Taxes Desc** (BNDD, conditional on Bonds = Yes): 1911; 1915; Local Assessments; Mello Roos; Transfer Tax County; Transfer Tax City; Transfer Tax Private; See Remarks; Other

**Current Financing** (EXTF): Assumable; Private; CalVet; Treat as Clear; Conventional; VA; Farm Home Loan; See Remarks; FHA; Other; PACE Type Loan

**Terms \*** (TERM): 1031 Exchange; Interest Buy Down; All Inclusive Trust Deed; Lease Option; Assumable; Mortgage Credit Certificate; Balloon; Owner May Carry; CalVet; Owner May Carry 2nd; Cash; Owner May Carry 3rd; CHFA; Owner Pay Points; Contract; Seller Equity Share; Conventional; Spcl-Cntrct/Addm-CLA; Creative; Subject To; Crypto; Submit; Energy Lease Assume; Trade; Energy Lien Assume; VA Loan; Farm Home Loan; See Remarks; FHA; Other; Fractional

**Possession \*** (POSS): Close Of Escrow; Subject To Tenant Rights; Negotiable; See Remarks; Rental Agreement; Other; Seller Rent Back

## 16. Listing Agreement, Marketing, Remarks

| Field | Req | Type | Field ID | Options / Notes |
|---|---|---|---|---|
| Listing Agreement | * | select | Agreement_Type_ComboBox | Exclusive Right To Sell; Exclusive Right To Lease; Seller Reserved; Net; Open |
| Photos Provided By | * | select | Picture_Provided_By | 3rd Party Photographer; Agent; Copy Existing Photo; Excluded by Seller; Seller |
| Publish To Internet | * | select | Publish_To_Internet | Yes; No |
| Show Address to Public | * | select | IADD | Yes; No |
| Public Remarks (Public/Internet) | | textarea | Property_Description | max 2,500 characters |
| Private Remarks | | textarea | Agent_Only_Remarks | max 1,300 characters (agent-only) |
| Directions to Property | * | textarea | Directions | max 500 characters |
| Map Override | | select | Geo_Override | No; Yes; Do Not Map Listing (Yes reveals Latitude / Longitude, max 11 each) |

---

## Notes for building the form

- Required counts: about 60 single fields plus 25 required multi-check groups (any group marked *).
- Build conditional logic for: ADU/2nd Unit → section 14; Pool → Pool Features; Spa → Spa Features; # of Fireplaces → Fireplace Features; Horse Property → Horse Features; Association → section 12; Bonds → Bonds Desc; Remodeled → Remodeled Desc; Firewise → Firewise Name; Secondary Showing Type → its name/phone; Occupant Type → Occupant Name/Phone; Map Override → Lat/Long.
- Special Listing Conditions allows a maximum of 5 selections.
- Use one phone field and one price field in the agent form, then split into the MLS boxes on export.
- A few legacy options that MetroList hides from new listings were left out (for example Showing "Call Listing Agent", Appliances "Gas Range", View "Ocean").
