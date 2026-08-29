/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import SunCalc from './suncalc.js';
import state from '../state.js';
import { getEffectiveSkyTemperatureK, solveSteadyStateSurfaceTemperature } from './sky-temperature.js';

export const materialPresets = {
  "roof_white_epdm": { name: "White EPDM Membrane", alpha: 0.15, eps: 0.90, group: "Roofing" },
  "roof_cool_coated": { name: "Highly Reflective Cool Roof Coating", alpha: 0.10, eps: 0.92, group: "Roofing" },
  "roof_asphalt": { name: "Aged Asphalt Shingles", alpha: 0.85, eps: 0.90, group: "Roofing" },
  "roof_metal_galv": { name: "Galvanized Steel Roof (Unpainted)", alpha: 0.65, eps: 0.20, group: "Roofing" },
  "roof_gravel": { name: "Gravel Ballasted Roof System", alpha: 0.70, eps: 0.88, group: "Roofing" },
  "facade_brick_red": { name: "Standard Red Clay Brick", alpha: 0.65, eps: 0.90, group: "Façade Cladding" },
  "facade_brick_dark": { name: "Dark Brown/Charcoal Brick", alpha: 0.88, eps: 0.90, group: "Façade Cladding" },
  "facade_concrete_light": { name: "Light Concrete / Off-white Stucco", alpha: 0.40, eps: 0.90, group: "Façade Cladding" },
  "facade_glass_dark": { name: "Spandrel Glass (Dark Backing)", alpha: 0.85, eps: 0.84, group: "Façade Cladding" },
  "facade_alum_polished": { name: "Polished Aluminum Composite Panel", alpha: 0.20, eps: 0.05, group: "Façade Cladding" },
  "facade_wood_dark": { name: "Dark Stained / Painted Wood Cladding", alpha: 0.75, eps: 0.90, group: "Façade Cladding" },
  "paving_asphalt_dark": { name: "New Dark Asphalt Paving", alpha: 0.92, eps: 0.90, group: "Paving & Hardscape" },
  "paving_concrete_aged": { name: "Aged Concrete Paving", alpha: 0.35, eps: 0.90, group: "Paving & Hardscape" },
  "paving_granite_light": { name: "Light Granite Paving Slabs", alpha: 0.45, eps: 0.85, group: "Paving & Hardscape" },
  "paving_grass_soil": { name: "Natural Grass / Exposed Soil Base", alpha: 0.74, eps: 0.95, group: "Paving & Hardscape" }
};

export const thermalMassPresets = {
    "f06_eifs_finish": { name: "F06 EIFS finish", group: "Plaster/Gypsum", thickness: 0.0095, conductivity: 0.72, density: 1856, specificHeat: 840, alpha: 0.55, eps: 0.9 }, 
    "f07_25mm_stucco": { name: "F07 25mm stucco", group: "Plaster/Gypsum", thickness: 0.0254, conductivity: 0.72, density: 1856, specificHeat: 840, alpha: 0.55, eps: 0.9 }, 
    "f08_metal_surface": { name: "F08 Metal surface", group: "Metals", thickness: 0.0008, conductivity: 45.28, density: 7824, specificHeat: 500, alpha: 0.55, eps: 0.25 }, 
    "f09_opaque_spandrel_glass": { name: "F09 Opaque spandrel glass", group: "Glass", thickness: 0.0064, conductivity: 0.99, density: 2528, specificHeat: 880, alpha: 0.83, eps: 0.9 }, 
    "f10_25mm_stone": { name: "F10 25mm stone", group: "Stone/Tile", thickness: 0.0254, conductivity: 3.17, density: 2560, specificHeat: 790, alpha: 0.65, eps: 0.9 }, 
    "f11_wood_siding": { name: "F11 Wood siding", group: "Wood", thickness: 0.0127, conductivity: 0.09, density: 592, specificHeat: 1170, alpha: 0.7, eps: 0.9 }, 
    "f12_asphalt_shingles": { name: "F12 Asphalt shingles", group: "Roofing Membrane", thickness: 0.0032, conductivity: 0.04, density: 1120, specificHeat: 1260, alpha: 0.85, eps: 0.9 }, 
    "f13_built_up_roofing": { name: "F13 Built-up roofing", group: "Roofing Membrane", thickness: 0.0095, conductivity: 0.16, density: 1120, specificHeat: 1460, alpha: 0.85, eps: 0.9 }, 
    "f14_slate_or_tile": { name: "F14 Slate or tile", group: "Stone/Tile", thickness: 0.0127, conductivity: 1.59, density: 1920, specificHeat: 1260, alpha: 0.82, eps: 0.9 }, 
    "f15_wood_shingles": { name: "F15 Wood shingles", group: "Wood", thickness: 0.0064, conductivity: 0.04, density: 592, specificHeat: 1300, alpha: 0.7, eps: 0.9 }, 
    "f16_acoustic_tile": { name: "F16 Acoustic tile", group: "Acoustic/Ceiling Tile", thickness: 0.0191, conductivity: 0.06, density: 368, specificHeat: 590, alpha: 0.5, eps: 0.9 }, 
    "f17_carpet": { name: "F17 Carpet", group: "Textile/Carpet", thickness: 0.0127, conductivity: 0.06, density: 288, specificHeat: 1380, alpha: 0.7, eps: 0.9 }, 
    "f18_terrazzo": { name: "F18 Terrazzo", group: "Stone/Tile", thickness: 0.0254, conductivity: 1.8, density: 2560, specificHeat: 790, alpha: 0.55, eps: 0.9 }, 
    "g01_16mm_gypsum_board": { name: "G01 16mm gypsum board", group: "Plaster/Gypsum", thickness: 0.0159, conductivity: 0.16, density: 800, specificHeat: 1090, alpha: 0.5, eps: 0.9 }, 
    "g01a_19mm_gypsum_board": { name: "G01a 19mm gypsum board", group: "Plaster/Gypsum", thickness: 0.019, conductivity: 0.16, density: 800, specificHeat: 1090, alpha: 0.5, eps: 0.9 }, 
    "g02_16mm_plywood": { name: "G02 16mm plywood", group: "Wood", thickness: 0.0159, conductivity: 0.12, density: 544, specificHeat: 1210, alpha: 0.6, eps: 0.9 }, 
    "g03_13mm_fiberboard_sheathing": { name: "G03 13mm fiberboard sheathing", group: "Wood", thickness: 0.0127, conductivity: 0.07, density: 400, specificHeat: 1300, alpha: 0.6, eps: 0.9 }, 
    "g04_13mm_wood": { name: "G04 13mm wood", group: "Wood", thickness: 0.0127, conductivity: 0.15, density: 608, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "g05_25mm_wood": { name: "G05 25mm wood", group: "Wood", thickness: 0.0254, conductivity: 0.15, density: 608, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "g06_50mm_wood": { name: "G06 50mm wood", group: "Wood", thickness: 0.0508, conductivity: 0.15, density: 608, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "g07_100mm_wood": { name: "G07 100mm wood", group: "Wood", thickness: 0.1016, conductivity: 0.15, density: 608, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "i01_25mm_insulation_board": { name: "I01 25mm insulation board", group: "Insulation", thickness: 0.0254, conductivity: 0.03, density: 43, specificHeat: 1210, alpha: 0.6, eps: 0.9 }, 
    "i02_50mm_insulation_board": { name: "I02 50mm insulation board", group: "Insulation", thickness: 0.0508, conductivity: 0.03, density: 43, specificHeat: 1210, alpha: 0.6, eps: 0.9 }, 
    "i03_75mm_insulation_board": { name: "I03 75mm insulation board", group: "Insulation", thickness: 0.0762, conductivity: 0.03, density: 43, specificHeat: 1210, alpha: 0.6, eps: 0.9 }, 
    "i04_89mm_batt_insulation": { name: "I04 89mm batt insulation", group: "Insulation", thickness: 0.0894, conductivity: 0.05, density: 19, specificHeat: 960, alpha: 0.6, eps: 0.9 }, 
    "i05_154mm_batt_insulation": { name: "I05 154mm batt insulation", group: "Insulation", thickness: 0.1544, conductivity: 0.05, density: 19, specificHeat: 960, alpha: 0.6, eps: 0.9 }, 
    "i06_244mm_batt_insulation": { name: "I06 244mm batt insulation", group: "Insulation", thickness: 0.2438, conductivity: 0.05, density: 19, specificHeat: 960, alpha: 0.6, eps: 0.9 }, 
    "m01_100mm_brick": { name: "M01 100mm brick", group: "Masonry/Brick", thickness: 0.1016, conductivity: 0.89, density: 1920, specificHeat: 790, alpha: 0.7, eps: 0.9 }, 
    "m02_150mm_lightweight_concrete_block": { name: "M02 150mm lightweight concrete block", group: "Masonry/Concrete Block", thickness: 0.1524, conductivity: 0.49, density: 512, specificHeat: 880, alpha: 0.65, eps: 0.9 }, 
    "m03_200mm_lightweight_concrete_block": { name: "M03 200mm lightweight concrete block", group: "Masonry/Concrete Block", thickness: 0.2032, conductivity: 0.5, density: 464, specificHeat: 880, alpha: 0.65, eps: 0.9 }, 
    "m04_300mm_lightweight_concrete_block": { name: "M04 300mm lightweight concrete block", group: "Masonry/Concrete Block", thickness: 0.3048, conductivity: 0.71, density: 512, specificHeat: 880, alpha: 0.65, eps: 0.9 }, 
    "m05_200mm_concrete_block": { name: "M05 200mm concrete block", group: "Masonry/Concrete Block", thickness: 0.2032, conductivity: 1.11, density: 800, specificHeat: 920, alpha: 0.65, eps: 0.9 }, 
    "m06_300mm_concrete_block": { name: "M06 300mm concrete block", group: "Masonry/Concrete Block", thickness: 0.3048, conductivity: 1.4, density: 800, specificHeat: 920, alpha: 0.65, eps: 0.9 }, 
    "m07_150mm_lightweight_concrete_block_filled": { name: "M07 150mm lightweight concrete block (filled)", group: "Masonry/Concrete Block", thickness: 0.1524, conductivity: 0.29, density: 512, specificHeat: 880, alpha: 0.65, eps: 0.9 }, 
    "m08_200mm_lightweight_concrete_block_filled": { name: "M08 200mm lightweight concrete block (filled)", group: "Masonry/Concrete Block", thickness: 0.2032, conductivity: 0.26, density: 464, specificHeat: 880, alpha: 0.65, eps: 0.9 }, 
    "m09_300mm_lightweight_concrete_block_filled": { name: "M09 300mm lightweight concrete block (filled)", group: "Masonry/Concrete Block", thickness: 0.3048, conductivity: 0.29, density: 512, specificHeat: 880, alpha: 0.65, eps: 0.9 }, 
    "m10_200mm_concrete_block_filled": { name: "M10 200mm concrete block (filled)", group: "Masonry/Concrete Block", thickness: 0.2032, conductivity: 0.72, density: 800, specificHeat: 920, alpha: 0.65, eps: 0.9 }, 
    "m11_100mm_lightweight_concrete": { name: "M11 100mm lightweight concrete", group: "Concrete", thickness: 0.1016, conductivity: 0.53, density: 1280, specificHeat: 840, alpha: 0.65, eps: 0.9 }, 
    "m12_150mm_lightweight_concrete": { name: "M12 150mm lightweight concrete", group: "Concrete", thickness: 0.1524, conductivity: 0.53, density: 1280, specificHeat: 840, alpha: 0.65, eps: 0.9 }, 
    "m13_200mm_lightweight_concrete": { name: "M13 200mm lightweight concrete", group: "Concrete", thickness: 0.2032, conductivity: 0.53, density: 1280, specificHeat: 840, alpha: 0.65, eps: 0.9 }, 
    "m14a_100mm_heavyweight_concrete": { name: "M14a 100mm heavyweight concrete", group: "Concrete", thickness: 0.1016, conductivity: 1.95, density: 2240, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "m14_150mm_heavyweight_concrete": { name: "M14 150mm heavyweight concrete", group: "Concrete", thickness: 0.1524, conductivity: 1.95, density: 2240, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "m15_200mm_heavyweight_concrete": { name: "M15 200mm heavyweight concrete", group: "Concrete", thickness: 0.2032, conductivity: 1.95, density: 2240, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "m16_300mm_heavyweight_concrete": { name: "M16 300mm heavyweight concrete", group: "Concrete", thickness: 0.3048, conductivity: 1.95, density: 2240, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "m17_50mm_lightweight_concrete_roof_ballast": { name: "M17 50mm lightweight concrete roof ballast", group: "Concrete", thickness: 0.0508, conductivity: 0.19, density: 640, specificHeat: 840, alpha: 0.65, eps: 0.9 }, 
    "asbestos_cement_board_3_2mm": { name: "Asbestos-cement board - 3.2mm", group: "Cement Board", thickness: 0.0032, conductivity: 0.58, density: 1900, specificHeat: 1000, alpha: 0.65, eps: 0.9 }, 
    "asbestos_cement_board_6_4mm": { name: "Asbestos-cement board - 6.4mm", group: "Cement Board", thickness: 0.0064, conductivity: 0.58, density: 1900, specificHeat: 1000, alpha: 0.65, eps: 0.9 }, 
    "gypsum_or_plaster_board_9_5mm": { name: "Gypsum or plaster board - 9.5mm", group: "Plaster/Gypsum", thickness: 0.0095, conductivity: 0.58, density: 800, specificHeat: 1090, alpha: 0.5, eps: 0.9 }, 
    "gypsum_or_plaster_board_2_7mm": { name: "Gypsum or plaster board - 2.7mm", group: "Plaster/Gypsum", thickness: 0.0027, conductivity: 0.58, density: 800, specificHeat: 1090, alpha: 0.5, eps: 0.9 }, 
    "gypsum_or_plaster_board_5_9mm": { name: "Gypsum or plaster board - 5.9mm", group: "Plaster/Gypsum", thickness: 0.0059, conductivity: 0.58, density: 800, specificHeat: 1090, alpha: 0.5, eps: 0.9 }, 
    "plywood_douglas_fir_6_4mm": { name: "Plywood (Douglas Fir) - 6.4mm", group: "Wood", thickness: 0.0064, conductivity: 0.12, density: 540, specificHeat: 1210, alpha: 0.6, eps: 0.9 }, 
    "plywood_douglas_fir_9_5mm": { name: "Plywood (Douglas Fir) - 9.5mm", group: "Wood", thickness: 0.0095, conductivity: 0.12, density: 540, specificHeat: 1210, alpha: 0.6, eps: 0.9 }, 
    "plywood_douglas_fir_12_7mm": { name: "Plywood (Douglas Fir) - 12.7mm", group: "Wood", thickness: 0.0127, conductivity: 0.12, density: 540, specificHeat: 1210, alpha: 0.6, eps: 0.9 }, 
    "plywood_douglas_fir_15_9mm": { name: "Plywood (Douglas Fir) - 15.9mm", group: "Wood", thickness: 0.0159, conductivity: 0.12, density: 540, specificHeat: 1210, alpha: 0.6, eps: 0.9 }, 
    "plywood_or_wood_panels_19_0mm": { name: "Plywood or wood panels - 19.0mm", group: "Wood", thickness: 0.019, conductivity: 0.12, density: 540, specificHeat: 1210, alpha: 0.6, eps: 0.9 }, 
    "sheathing_regular_density_12_7mm": { name: "Sheathing - regular density - 12.7mm", group: "Wood", thickness: 0.0127, conductivity: 0.055, density: 290, specificHeat: 1300, alpha: 0.6, eps: 0.9 }, 
    "sheathing_regular_density_19_8mm": { name: "Sheathing - regular density - 19.8mm", group: "Wood", thickness: 0.0198, conductivity: 0.055, density: 290, specificHeat: 1300, alpha: 0.6, eps: 0.9 }, 
    "sheathing_intermediate_density_12_7mm": { name: "Sheathing intermediate density - 12.7mm", group: "Wood", thickness: 0.0127, conductivity: 0.057, density: 350, specificHeat: 1300, alpha: 0.6, eps: 0.9 }, 
    "nail_base_sheathing_12_7mm": { name: "Nail-base sheathing - 12.7mm", group: "Wood", thickness: 0.0127, conductivity: 0.057, density: 400, specificHeat: 1300, alpha: 0.6, eps: 0.9 }, 
    "shingle_backer_9_5mm": { name: "Shingle backer - 9.5mm", group: "Wood", thickness: 0.0095, conductivity: 0.063, density: 290, specificHeat: 1300, alpha: 0.6, eps: 0.9 }, 
    "shingle_backer_7_9mm": { name: "Shingle backer - 7.9mm", group: "Wood", thickness: 0.0079, conductivity: 0.063, density: 290, specificHeat: 1300, alpha: 0.6, eps: 0.9 }, 
    "sound_deadening_board": { name: "Sound deadening board", group: "Wood", thickness: 0.0127, conductivity: 0.063, density: 240, specificHeat: 1260, alpha: 0.6, eps: 0.9 }, 
    "tile_and_lay_in_panels_plain_or_acoustic_12_7mm": { name: "Tile and lay-in panels - plain or acoustic - 12.7mm", group: "Acoustic/Ceiling Tile", thickness: 0.0127, conductivity: 0.057, density: 290, specificHeat: 590, alpha: 0.5, eps: 0.9 }, 
    "tile_and_lay_in_panels_plain_or_acoustic_19mm": { name: "Tile and lay-in panels - plain or acoustic - 19mm", group: "Acoustic/Ceiling Tile", thickness: 0.019, conductivity: 0.057, density: 290, specificHeat: 590, alpha: 0.5, eps: 0.9 }, 
    "laminated_paperboard": { name: "Laminated paperboard", group: "Wood", thickness: 0.0032, conductivity: 0.072, density: 480, specificHeat: 1380, alpha: 0.6, eps: 0.9 }, 
    "homogeneous_board_from_repulped_paper": { name: "Homogeneous board from repulped paper", group: "Wood", thickness: 0.0032, conductivity: 0.072, density: 480, specificHeat: 1170, alpha: 0.6, eps: 0.9 }, 
    "hardboard_medium_density": { name: "Hardboard Medium density", group: "Wood", thickness: 0.019, conductivity: 0.105, density: 800, specificHeat: 1300, alpha: 0.6, eps: 0.9 }, 
    "hardboard_high_density_service_tempered_grade_and_service_grade": { name: "Hardboard High density - service-tempered grade and service grade", group: "Wood", thickness: 0.019, conductivity: 0.82, density: 880, specificHeat: 1340, alpha: 0.6, eps: 0.9 }, 
    "hardboard_high_density_standard_tempered_grade": { name: "Hardboard High density - standard-tempered grade", group: "Wood", thickness: 0.019, conductivity: 0.144, density: 1010, specificHeat: 1340, alpha: 0.6, eps: 0.9 }, 
    "particleboard_low_density": { name: "Particleboard Low density", group: "Wood", thickness: 0.019, conductivity: 0.102, density: 590, specificHeat: 1300, alpha: 0.6, eps: 0.9 }, 
    "particleboard_medium_density": { name: "Particleboard Medium density", group: "Wood", thickness: 0.019, conductivity: 0.135, density: 800, specificHeat: 1300, alpha: 0.6, eps: 0.9 }, 
    "particleboard_high_density": { name: "Particleboard High density", group: "Wood", thickness: 0.019, conductivity: 0.17, density: 1000, specificHeat: 1300, alpha: 0.6, eps: 0.9 }, 
    "particleboard_underlayment_15_9mm": { name: "Particleboard Underlayment - 15.9mm", group: "Wood", thickness: 0.0159, conductivity: 0.311, density: 640, specificHeat: 1210, alpha: 0.6, eps: 0.9 }, 
    "waferboard": { name: "Waferboard", group: "Wood", thickness: 0.019, conductivity: 0.091, density: 590, specificHeat: 1300, alpha: 0.6, eps: 0.9 }, 
    "wood_subfloor_19mm": { name: "Wood subfloor - 19mm", group: "Wood", thickness: 0.019, conductivity: 0.115, density: 800, specificHeat: 1380, alpha: 0.6, eps: 0.9 }, 
    "insulation_cellular_glass_25mm": { name: "Insulation: Cellular glass - 25mm", group: "Insulation", thickness: 0.025, conductivity: 0.05, density: 136, specificHeat: 750, alpha: 0.6, eps: 0.9 }, 
    "insulation_cellular_glass_50mm": { name: "Insulation: Cellular glass - 50mm", group: "Insulation", thickness: 0.05, conductivity: 0.05, density: 136, specificHeat: 750, alpha: 0.6, eps: 0.9 }, 
    "insulation_cellular_glass_75mm": { name: "Insulation: Cellular glass - 75mm", group: "Insulation", thickness: 0.075, conductivity: 0.05, density: 136, specificHeat: 750, alpha: 0.6, eps: 0.9 }, 
    "insulation_glass_fiber_organic_bonded_25mm": { name: "Insulation: Glass fiber - organic bonded - 25mm", group: "Insulation", thickness: 0.025, conductivity: 0.036, density: 64, specificHeat: 960, alpha: 0.6, eps: 0.9 }, 
    "insulation_glass_fiber_organic_bonded_50mm": { name: "Insulation: Glass fiber - organic bonded - 50mm", group: "Insulation", thickness: 0.05, conductivity: 0.036, density: 140, specificHeat: 960, alpha: 0.6, eps: 0.9 }, 
    "insulation_glass_fiber_organic_bonded_75mm": { name: "Insulation: Glass fiber - organic bonded - 75mm", group: "Insulation", thickness: 0.075, conductivity: 0.036, density: 140, specificHeat: 960, alpha: 0.6, eps: 0.9 }, 
    "insulation_expanded_perlite_organic_bonded_25mm": { name: "Insulation: Expanded perlite - organic bonded - 25mm", group: "Insulation", thickness: 0.025, conductivity: 0.052, density: 16, specificHeat: 1260, alpha: 0.6, eps: 0.9 }, 
    "insulation_expanded_rubber_rigid_25mm": { name: "Insulation: Expanded rubber (rigid) - 25mm", group: "Insulation", thickness: 0.025, conductivity: 0.032, density: 72, specificHeat: 1680, alpha: 0.6, eps: 0.9 }, 
    "insulation_expanded_polystyrene_extruded_smooth_skin_surface_cfc_12_exp": { name: "Insulation: Expanded polystyrene - extruded (smooth skin surface) (CFC-12 exp.)", group: "Insulation", thickness: 0.025, conductivity: 0.029, density: 29, specificHeat: 1210, alpha: 0.6, eps: 0.9 }, 
    "insulation_expanded_polystyrene_extruded_smooth_skin_surface_hcfc_142b_exp": { name: "Insulation: Expanded polystyrene - extruded (smooth skin surface) (HCFC-142b exp.)", group: "Insulation", thickness: 0.025, conductivity: 0.029, density: 29, specificHeat: 1210, alpha: 0.6, eps: 0.9 }, 
    "insulation_expanded_polystyrene_molded_beads_16kg_m3_density": { name: "Insulation: Expanded polystyrene - molded beads - 16kg/m3 density", group: "Insulation", thickness: 0.025, conductivity: 0.037, density: 16, specificHeat: 1210, alpha: 0.6, eps: 0.9 }, 
    "insulation_expanded_polystyrene_molded_beads_20kg_m3_density": { name: "Insulation: Expanded polystyrene - molded beads - 20kg/m3 density", group: "Insulation", thickness: 0.025, conductivity: 0.036, density: 20, specificHeat: 1210, alpha: 0.6, eps: 0.9 }, 
    "insulation_expanded_polystyrene_molded_beads_24kg_m3_density": { name: "Insulation: Expanded polystyrene - molded beads - 24kg/m3 density", group: "Insulation", thickness: 0.025, conductivity: 0.035, density: 24, specificHeat: 1210, alpha: 0.6, eps: 0.9 }, 
    "insulation_expanded_polystyrene_molded_beads_28_k6_m3_density": { name: "Insulation: Expanded polystyrene - molded beads - 28 k6/m3 density", group: "Insulation", thickness: 0.025, conductivity: 0.035, density: 28, specificHeat: 1210, alpha: 0.6, eps: 0.9 }, 
    "insulation_expanded_polystyrene_molded_beads_32_kg_m3_density": { name: "Insulation: Expanded polystyrene - molded beads - 32 kg/m3 density", group: "Insulation", thickness: 0.025, conductivity: 0.033, density: 32, specificHeat: 1210, alpha: 0.6, eps: 0.9 }, 
    "insulation_cellular_polyurethane_polyisocyanuratei_cfc11_exp_unfaced": { name: "Insulation: Cellular polyurethane/polyisocyanuratei (CFC11 exp.) (unfaced)", group: "Insulation", thickness: 0.025, conductivity: 0.0245, density: 24, specificHeat: 1590, alpha: 0.6, eps: 0.9 }, 
    "insulation_cellular_polyisocyanuratei_cfc_11_exp_gaspermeable_facers": { name: "Insulation: Cellular polyisocyanuratei (CFC-11 exp.) (gaspermeable facers)", group: "Insulation", thickness: 0.025, conductivity: 0.0245, density: 32, specificHeat: 920, alpha: 0.6, eps: 0.9 }, 
    "insulation_cellular_polyisocyanuratej_cfc_11_exp_gasimpermeable_facers": { name: "Insulation: Cellular polyisocyanuratej (CFC-11 exp.) (gasimpermeable facers)", group: "Insulation", thickness: 0.025, conductivity: 0.02, density: 32, specificHeat: 920, alpha: 0.6, eps: 0.9 }, 
    "brick_fired_clay_2400_kg_m3_102mm": { name: "Brick - fired clay - 2400 kg/m3 - 102mm", group: "Masonry/Brick", thickness: 0.102, conductivity: 1.34, density: 2400, specificHeat: 790, alpha: 0.7, eps: 0.9 }, 
    "brick_fired_clay_2240_kg_m3_102mm": { name: "Brick - fired clay - 2240 kg/m3 - 102mm", group: "Masonry/Brick", thickness: 0.102, conductivity: 1.185, density: 2240, specificHeat: 790, alpha: 0.7, eps: 0.9 }, 
    "brick_fired_clay_2080_kg_m3_102mm": { name: "Brick - fired clay - 2080 kg/m3 - 102mm", group: "Masonry/Brick", thickness: 0.102, conductivity: 1.02, density: 2080, specificHeat: 790, alpha: 0.7, eps: 0.9 }, 
    "brick_fired_clay_1920_kg_m3_102mm": { name: "Brick - fired clay - 1920 kg/m3 - 102mm", group: "Masonry/Brick", thickness: 0.102, conductivity: 0.895, density: 1920, specificHeat: 790, alpha: 0.7, eps: 0.9 }, 
    "brick_fired_clay_1760_kg_m3_102mm": { name: "Brick - fired clay - 1760 kg/m3 - 102mm", group: "Masonry/Brick", thickness: 0.102, conductivity: 0.78, density: 1760, specificHeat: 790, alpha: 0.7, eps: 0.9 }, 
    "brick_fired_clay_1600_kg_m3_102mm": { name: "Brick - fired clay - 1600 kg/m3 - 102mm", group: "Masonry/Brick", thickness: 0.102, conductivity: 0.675, density: 1600, specificHeat: 790, alpha: 0.7, eps: 0.9 }, 
    "brick_fired_clay_1440_kg_m3_102mm": { name: "Brick - fired clay - 1440 kg/m3 - 102mm", group: "Masonry/Brick", thickness: 0.102, conductivity: 0.57, density: 1440, specificHeat: 790, alpha: 0.7, eps: 0.9 }, 
    "brick_fired_clay_1280_kg_m3_102mm": { name: "Brick - fired clay - 1280 kg/m3 - 102mm", group: "Masonry/Brick", thickness: 0.102, conductivity: 0.48, density: 1280, specificHeat: 790, alpha: 0.7, eps: 0.9 }, 
    "brick_fired_clay_1120_kg_m3_102mm": { name: "Brick - fired clay - 1120 kg/m3 - 102mm", group: "Masonry/Brick", thickness: 0.102, conductivity: 0.405, density: 1120, specificHeat: 790, alpha: 0.7, eps: 0.9 }, 
    "quartzitic_and_sandstone_2880_kg_m3_13mm": { name: "Quartzitic and sandstone - 2880 kg/m3 - 13mm", group: "Stone/Tile", thickness: 0.013, conductivity: 10.4, density: 2880, specificHeat: 790, alpha: 0.65, eps: 0.9 }, 
    "quartzitic_and_sandstone_2560_kg_m3_13mm": { name: "Quartzitic and sandstone - 2560 kg/m3 - 13mm", group: "Stone/Tile", thickness: 0.013, conductivity: 6.2, density: 2560, specificHeat: 790, alpha: 0.65, eps: 0.9 }, 
    "quartzitic_and_sandstone_2240_kg_m3_13mm": { name: "Quartzitic and sandstone - 2240 kg/m3 - 13mm", group: "Stone/Tile", thickness: 0.013, conductivity: 3.5, density: 2240, specificHeat: 790, alpha: 0.65, eps: 0.9 }, 
    "quartzitic_and_sandstone_1920_kg_m3_13mm": { name: "Quartzitic and sandstone - 1920 kg/m3 - 13mm", group: "Stone/Tile", thickness: 0.013, conductivity: 1.9, density: 1920, specificHeat: 790, alpha: 0.65, eps: 0.9 }, 
    "calcitic_dolomitic_limestone_marble_and_granite_2880_kg_m3_13mm": { name: "Calcitic - dolomitic - limestone - marble - and granite - 2880 kg/m3 - 13mm", group: "Stone/Tile", thickness: 0.013, conductivity: 4.3, density: 2880, specificHeat: 790, alpha: 0.65, eps: 0.9 }, 
    "calcitic_dolomitic_limestone_marble_and_granite_2560_kg_m3_13mm": { name: "Calcitic - dolomitic - limestone - marble - and granite - 2560 kg/m3 - 13mm", group: "Stone/Tile", thickness: 0.013, conductivity: 3.2, density: 2560, specificHeat: 790, alpha: 0.65, eps: 0.9 }, 
    "calcitic_dolomitic_limestone_marble_and_granite_2240_kg_m3_13mm": { name: "Calcitic - dolomitic - limestone - marble - and granite - 2240 kg/m3 - 13mm", group: "Stone/Tile", thickness: 0.013, conductivity: 2.3, density: 2240, specificHeat: 790, alpha: 0.65, eps: 0.9 }, 
    "calcitic_dolomitic_limestone_marble_and_granite_1920_kg_m3_13mm": { name: "Calcitic - dolomitic - limestone - marble - and granite - 1920 kg/m3 - 13mm", group: "Stone/Tile", thickness: 0.013, conductivity: 1.6, density: 1920, specificHeat: 790, alpha: 0.65, eps: 0.9 }, 
    "calcitic_dolomitic_limestone_marble_and_granite_1600_kg_m3_13mm": { name: "Calcitic - dolomitic - limestone - marble - and granite - 1600 kg/m3 - 13mm", group: "Stone/Tile", thickness: 0.013, conductivity: 1.1, density: 1600, specificHeat: 790, alpha: 0.65, eps: 0.9 }, 
    "concrete_sand_and_gravel_or_stone_aggregate_concretes_2400_kg_m3_51mm": { name: "Concrete: Sand and gravel or stone aggregate concretes - 2400 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 2.15, density: 2400, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_sand_and_gravel_or_stone_aggregate_concretes_2240_kg_m3_51mm": { name: "Concrete: Sand and gravel or stone aggregate concretes - 2240 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 1.95, density: 2240, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_sand_and_gravel_or_stone_aggregate_concretes_2080_kg_m3_51mm": { name: "Concrete: Sand and gravel or stone aggregate concretes - 2080 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 1.45, density: 2080, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_limestone_concretes_2240_kg_m3_51mm": { name: "Concrete: Limestone concretes - 2240 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 1.6, density: 2240, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_limestone_concretes_1920_kg_m3_51mm": { name: "Concrete: Limestone concretes - 1920 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 1.14, density: 1920, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_limestone_concretes_1600_kg_m3_51mm": { name: "Concrete: Limestone concretes - 1600 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 0.79, density: 1600, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_gypsum_fiber_concrete_87_5_gypsum_12_5_wood_chips_51mm": { name: "Concrete: Gypsum-fiber concrete (87.5% gypsum - 12.5% wood chips) - 51mm", group: "Plaster/Gypsum", thickness: 0.051, conductivity: 0.24, density: 816, specificHeat: 880, alpha: 0.5, eps: 0.9 }, 
    "concrete_cement_lime_mortar_and_stucco_1920_kg_m3_51mm": { name: "Concrete: Cement/lime - mortar - and stucco - 1920 kg/m3 - 51mm", group: "Plaster/Gypsum", thickness: 0.051, conductivity: 1.4, density: 1920, specificHeat: 900, alpha: 0.55, eps: 0.9 }, 
    "concrete_cement_lime_mortar_and_stucco_1600_kg_m3_51mm": { name: "Concrete: Cement/lime - mortar - and stucco - 1600 kg/m3 - 51mm", group: "Plaster/Gypsum", thickness: 0.051, conductivity: 0.97, density: 1600, specificHeat: 900, alpha: 0.55, eps: 0.9 }, 
    "concrete_cement_lime_mortar_and_stucco_1280_kg_m3_51mm": { name: "Concrete: Cement/lime - mortar - and stucco - 1280 kg/m3 - 51mm", group: "Plaster/Gypsum", thickness: 0.051, conductivity: 0.65, density: 1280, specificHeat: 900, alpha: 0.55, eps: 0.9 }, 
    "concrete_expanded_shale_clay_slate_expanded_slags_cinders_pumice_1920_kg_m3_51mm": { name: "Concrete: Expanded shale - clay - slate - expanded slags - cinders - pumice - 1920 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 1.1, density: 1920, specificHeat: 840, alpha: 0.65, eps: 0.9 }, 
    "concrete_expanded_shale_clay_slate_expanded_slags_cinders_pumice_1600_kg_m3_51mm": { name: "Concrete: Expanded shale - clay - slate - expanded slags - cinders - pumice - 1600 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 0.785, density: 1600, specificHeat: 840, alpha: 0.65, eps: 0.9 }, 
    "concrete_expanded_shale_clay_slate_expanded_slags_cinders_pumice_1280_kg_m3_51mm": { name: "Concrete: Expanded shale - clay - slate - expanded slags - cinders - pumice - 1280 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 0.535, density: 1280, specificHeat: 840, alpha: 0.65, eps: 0.9 }, 
    "concrete_expanded_shale_clay_slate_expanded_slags_cinders_pumice_960_kg_m3_51mm": { name: "Concrete: Expanded shale - clay - slate - expanded slags - cinders - pumice - 960 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 0.33, density: 960, specificHeat: 840, alpha: 0.65, eps: 0.9 }, 
    "concrete_expanded_shale_clay_slate_expanded_slags_cinders_pumice_640_kg_m3_51mm": { name: "Concrete: Expanded shale - clay - slate - expanded slags - cinders - pumice - 640 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 0.18, density: 640, specificHeat: 840, alpha: 0.65, eps: 0.9 }, 
    "concrete_perlite_vermiculite_and_polystyrene_beads_800_kg_m3_51mm": { name: "Concrete: Perlite - vermiculite - and polystyrene beads - 800 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 0.265, density: 800, specificHeat: 795, alpha: 0.65, eps: 0.9 }, 
    "concrete_perlite_vermiculite_and_polystyrene_beads_640_kg_m3_51mm": { name: "Concrete: Perlite - vermiculite - and polystyrene beads - 640 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 0.21, density: 640, specificHeat: 795, alpha: 0.65, eps: 0.9 }, 
    "concrete_perlite_vermiculite_and_polystyrene_beads_480_kg_m3_51mm": { name: "Concrete: Perlite - vermiculite - and polystyrene beads - 480 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 0.16, density: 480, specificHeat: 795, alpha: 0.65, eps: 0.9 }, 
    "concrete_perlite_vermiculite_and_polystyrene_beads_320_kg_m3_51mm": { name: "Concrete: Perlite - vermiculite - and polystyrene beads - 320 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 0.12, density: 320, specificHeat: 795, alpha: 0.65, eps: 0.9 }, 
    "concrete_foam_concretes_1920_kg_m3_51mm": { name: "Concrete: Foam concretes - 1920 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 0.75, density: 1920, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_foam_concretes_1600_kg_m3_51mm": { name: "Concrete: Foam concretes - 1600 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 0.6, density: 1600, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_foam_concretes_1280_kg_m3_51mm": { name: "Concrete: Foam concretes - 1280 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 0.44, density: 1280, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_foam_concretes_1120_kg_m3_51mm": { name: "Concrete: Foam concretes - 1120 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 0.36, density: 1120, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_foam_concretes_and_cellular_concretes_960_kg_m3_51mm": { name: "Concrete: Foam concretes and cellular concretes - 960 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 0.3, density: 960, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_foam_concretes_and_cellular_concretes_640_kg_m3_51mm": { name: "Concrete: Foam concretes and cellular concretes - 640 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 0.2, density: 640, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_foam_concretes_and_cellular_concretes_320_kg_m3_51mm": { name: "Concrete: Foam concretes and cellular concretes - 320 kg/m3 - 51mm", group: "Concrete", thickness: 0.051, conductivity: 0.12, density: 320, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_sand_and_gravel_or_stone_aggregate_concretes_2400_kg_m3_102mm": { name: "Concrete: Sand and gravel or stone aggregate concretes - 2400 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 2.15, density: 2400, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_sand_and_gravel_or_stone_aggregate_concretes_2240_kg_m3_102mm": { name: "Concrete: Sand and gravel or stone aggregate concretes - 2240 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 1.95, density: 2240, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_sand_and_gravel_or_stone_aggregate_concretes_2080_kg_m3_102mm": { name: "Concrete: Sand and gravel or stone aggregate concretes - 2080 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 1.45, density: 2080, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_limestone_concretes_2240_kg_m3_102mm": { name: "Concrete: Limestone concretes - 2240 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 1.6, density: 2240, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_limestone_concretes_1920_kg_m3_102mm": { name: "Concrete: Limestone concretes - 1920 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 1.14, density: 1920, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_limestone_concretes_1600_kg_m3_102mm": { name: "Concrete: Limestone concretes - 1600 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 0.79, density: 1600, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_gypsum_fiber_concrete_87_5_gypsum_12_5_wood_chips_102mm": { name: "Concrete: Gypsum-fiber concrete (87.5% gypsum - 12.5% wood chips) - 102mm", group: "Plaster/Gypsum", thickness: 0.102, conductivity: 0.24, density: 816, specificHeat: 880, alpha: 0.5, eps: 0.9 }, 
    "concrete_cement_lime_mortar_and_stucco_1920_kg_m3_102mm": { name: "Concrete: Cement/lime - mortar - and stucco - 1920 kg/m3 - 102mm", group: "Plaster/Gypsum", thickness: 0.102, conductivity: 1.4, density: 1920, specificHeat: 900, alpha: 0.55, eps: 0.9 }, 
    "concrete_cement_lime_mortar_and_stucco_1600_kg_m3_102mm": { name: "Concrete: Cement/lime - mortar - and stucco - 1600 kg/m3 - 102mm", group: "Plaster/Gypsum", thickness: 0.102, conductivity: 0.97, density: 1600, specificHeat: 900, alpha: 0.55, eps: 0.9 }, 
    "concrete_cement_lime_mortar_and_stucco_1280_kg_m3_102mm": { name: "Concrete: Cement/lime - mortar - and stucco - 1280 kg/m3 - 102mm", group: "Plaster/Gypsum", thickness: 0.102, conductivity: 0.65, density: 1280, specificHeat: 900, alpha: 0.55, eps: 0.9 }, 
    "concrete_expanded_shale_clay_slate_expanded_slags_cinders_pumice_1920_kg_m3_102mm": { name: "Concrete: Expanded shale - clay - slate - expanded slags - cinders - pumice - 1920 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 1.1, density: 1920, specificHeat: 840, alpha: 0.65, eps: 0.9 }, 
    "concrete_expanded_shale_clay_slate_expanded_slags_cinders_pumice_1600_kg_m3_102mm": { name: "Concrete: Expanded shale - clay - slate - expanded slags - cinders - pumice - 1600 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 0.785, density: 1600, specificHeat: 840, alpha: 0.65, eps: 0.9 }, 
    "concrete_expanded_shale_clay_slate_expanded_slags_cinders_pumice_1280_kg_m3_102mm": { name: "Concrete: Expanded shale - clay - slate - expanded slags - cinders - pumice - 1280 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 0.535, density: 1280, specificHeat: 840, alpha: 0.65, eps: 0.9 }, 
    "concrete_expanded_shale_clay_slate_expanded_slags_cinders_pumice_960_kg_m3_102mm": { name: "Concrete: Expanded shale - clay - slate - expanded slags - cinders - pumice - 960 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 0.33, density: 960, specificHeat: 840, alpha: 0.65, eps: 0.9 }, 
    "concrete_expanded_shale_clay_slate_expanded_slags_cinders_pumice_640_kg_m3_102mm": { name: "Concrete: Expanded shale - clay - slate - expanded slags - cinders - pumice - 640 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 0.18, density: 640, specificHeat: 840, alpha: 0.65, eps: 0.9 }, 
    "concrete_perlite_vermiculite_and_polystyrene_beads_800_kg_m3_102mm": { name: "Concrete: Perlite - vermiculite - and polystyrene beads - 800 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 0.265, density: 800, specificHeat: 795, alpha: 0.65, eps: 0.9 }, 
    "concrete_perlite_vermiculite_and_polystyrene_beads_640_kg_m3_102mm": { name: "Concrete: Perlite - vermiculite - and polystyrene beads - 640 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 0.21, density: 640, specificHeat: 795, alpha: 0.65, eps: 0.9 }, 
    "concrete_perlite_vermiculite_and_polystyrene_beads_480_kg_m3_102mm": { name: "Concrete: Perlite - vermiculite - and polystyrene beads - 480 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 0.16, density: 480, specificHeat: 795, alpha: 0.65, eps: 0.9 }, 
    "concrete_perlite_vermiculite_and_polystyrene_beads_320_kg_m3_102mm": { name: "Concrete: Perlite - vermiculite - and polystyrene beads - 320 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 0.12, density: 320, specificHeat: 795, alpha: 0.65, eps: 0.9 }, 
    "concrete_foam_concretes_1920_kg_m3_102mm": { name: "Concrete: Foam concretes - 1920 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 0.75, density: 1920, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_foam_concretes_1600_kg_m3_102mm": { name: "Concrete: Foam concretes - 1600 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 0.6, density: 1600, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_foam_concretes_1280_kg_m3_102mm": { name: "Concrete: Foam concretes - 1280 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 0.44, density: 1280, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_foam_concretes_1120_kg_m3_102mm": { name: "Concrete: Foam concretes - 1120 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 0.36, density: 1120, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_foam_concretes_and_cellular_concretes_960_kg_m3_102mm": { name: "Concrete: Foam concretes and cellular concretes - 960 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 0.3, density: 960, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_foam_concretes_and_cellular_concretes_640_kg_m3_102mm": { name: "Concrete: Foam concretes and cellular concretes - 640 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 0.2, density: 640, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "concrete_foam_concretes_and_cellular_concretes_320_kg_m3_102mm": { name: "Concrete: Foam concretes and cellular concretes - 320 kg/m3 - 102mm", group: "Concrete", thickness: 0.102, conductivity: 0.12, density: 320, specificHeat: 900, alpha: 0.65, eps: 0.9 }, 
    "hardwood_12_9mm": { name: "Hardwood - 12.9mm", group: "Wood", thickness: 0.0129, conductivity: 0.167, density: 680, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "hardwood_19mm": { name: "Hardwood - 19mm", group: "Wood", thickness: 0.019, conductivity: 0.167, density: 680, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "hardwood_25mm": { name: "Hardwood - 25mm", group: "Wood", thickness: 0.025, conductivity: 0.167, density: 680, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "oak_25mm": { name: "Oak - 25mm", group: "Wood", thickness: 0.025, conductivity: 0.17, density: 704, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "birch_25mm": { name: "Birch - 25mm", group: "Wood", thickness: 0.025, conductivity: 0.172, density: 704, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "maple_25mm": { name: "Maple - 25mm", group: "Wood", thickness: 0.025, conductivity: 0.164, density: 671, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "ash_25mm": { name: "Ash - 25mm", group: "Wood", thickness: 0.025, conductivity: 0.159, density: 642, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "softwood_12_9mm": { name: "Softwood - 12.9mm", group: "Wood", thickness: 0.0129, conductivity: 0.129, density: 496, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "softwood_19mm": { name: "Softwood - 19mm", group: "Wood", thickness: 0.019, conductivity: 0.129, density: 496, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "softwood_25mm": { name: "Softwood - 25mm", group: "Wood", thickness: 0.025, conductivity: 0.129, density: 496, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "southern_pine_25mm": { name: "Southern Pine - 25mm", group: "Wood", thickness: 0.025, conductivity: 0.153, density: 615, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "douglas_fir_larch_25mm": { name: "Douglas Fir-Larch - 25mm", group: "Wood", thickness: 0.025, conductivity: 0.141, density: 559, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "southern_cypress_25mm": { name: "Southern Cypress - 25mm", group: "Wood", thickness: 0.025, conductivity: 0.131, density: 508, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "hem_fir_spruce_pine_fir_25mm": { name: "Hem-Fir - Spruce-Pine-Fir - 25mm", group: "Wood", thickness: 0.025, conductivity: 0.119, density: 447, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "west_coast_woods_cedars_25mm": { name: "West Coast Woods - Cedars - 25mm", group: "Wood", thickness: 0.025, conductivity: 0.114, density: 425, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "california_redwood_25mm": { name: "California Redwood - 25mm", group: "Wood", thickness: 0.025, conductivity: 0.113, density: 420, specificHeat: 1630, alpha: 0.6, eps: 0.9 }, 
    "concrete_block_limestone_aggregrate_200mm_16_3_kg_2_cores": { name: "Concrete Block: Limestone Aggregrate: 200mm - 16.3 kg - 2 cores", group: "Masonry/Concrete Block", thickness: 0.2, conductivity: 1.13, density: 2210, specificHeat: 920, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_limestone_aggregrate_200mm_16_3_kg_2_cores_perlite_filled_cores": { name: "Concrete Block: Limestone Aggregrate: 200mm - 16.3 kg - 2 cores - perlite filled cores", group: "Masonry/Concrete Block", thickness: 0.2, conductivity: 1.13, density: 2210, specificHeat: 920, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_limestone_aggregrate_300mm_25_kg_2_cores": { name: "Concrete Block: Limestone Aggregrate: 300mm - 25 kg - 2 cores", group: "Masonry/Concrete Block", thickness: 0.3, conductivity: 1.13, density: 2210, specificHeat: 920, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_limestone_aggregrate_300mm_25_kg_2_cores_perlite_filled_cores": { name: "Concrete Block: Limestone Aggregrate: 300mm - 25 kg - 2 cores - perlite filled cores", group: "Masonry/Concrete Block", thickness: 0.3, conductivity: 1.13, density: 2210, specificHeat: 920, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_sand_and_gravel_aggregrate_15_16_kg_2_or_3_cores": { name: "Concrete Block: Sand and Gravel Aggregrate: 15-16 kg - 2 or 3 cores", group: "Masonry/Concrete Block", thickness: 0.2, conductivity: 1.13, density: 2180, specificHeat: 920, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_sand_and_gravel_aggregrate_15_16_kg_2_or_3_cores_perlite_filled_cores": { name: "Concrete Block: Sand and Gravel Aggregrate: 15-16 kg - 2 or 3 cores - perlite filled cores", group: "Masonry/Concrete Block", thickness: 0.2, conductivity: 1.13, density: 2180, specificHeat: 920, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_sand_and_gravel_aggregrate_15_16_kg_2_or_3_cores_vermiculite_filled_cores": { name: "Concrete Block: Sand and Gravel Aggregrate: 15-16 kg - 2 or 3 cores - vermiculite filled cores", group: "Masonry/Concrete Block", thickness: 0.2, conductivity: 1.13, density: 2180, specificHeat: 920, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_sand_and_gravel_aggregrate_22_7_kg_2_cores": { name: "Concrete Block: Sand and Gravel Aggregrate: 22.7 kg - 2 cores", group: "Masonry/Concrete Block", thickness: 0.3, conductivity: 1.13, density: 2000, specificHeat: 920, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_medium_mass_aggregate_2_or_3_cores": { name: "Concrete Block: Medium Mass Aggregate: 2 or 3 cores", group: "Masonry/Concrete Block", thickness: 0.3, conductivity: 1.13, density: 1790, specificHeat: 920, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_medium_mass_aggregate_2_or_3_cores_perlite_filled_cores": { name: "Concrete Block: Medium Mass Aggregate: 2 or 3 cores - perlite filled cores", group: "Masonry/Concrete Block", thickness: 0.3, conductivity: 1.13, density: 1790, specificHeat: 920, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_medium_mass_aggregate_2_or_3_cores_vermiculite_filled_cores": { name: "Concrete Block: Medium Mass Aggregate: 2 or 3 cores - vermiculite filled cores", group: "Masonry/Concrete Block", thickness: 0.3, conductivity: 1.13, density: 1790, specificHeat: 920, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_medium_mass_aggregate_2_or_3_cores_molded_eps_beads_filled_cores": { name: "Concrete Block: Medium Mass Aggregate: 2 or 3 cores - molded EPS (beads) filled cores", group: "Masonry/Concrete Block", thickness: 0.3, conductivity: 1.13, density: 1790, specificHeat: 920, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_medium_mass_aggregate_2_or_3_cores_molded_eps_inserts_in_cores": { name: "Concrete Block: Medium Mass Aggregate: 2 or 3 cores - molded EPS inserts in cores", group: "Masonry/Concrete Block", thickness: 0.3, conductivity: 1.13, density: 1790, specificHeat: 920, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_low_mass_aggregate_7_3_7_7_kg_2_or_3_cores": { name: "Concrete Block: Low Mass Aggregate: 7.3-7.7 kg - 2 or 3 cores", group: "Masonry/Concrete Block", thickness: 0.15, conductivity: 0.33, density: 1390, specificHeat: 880, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_low_mass_aggregate_7_3_7_7_kg_2_or_3_cores_perlite_filled_cores": { name: "Concrete Block: Low Mass Aggregate: 7.3-7.7 kg - 2 or 3 cores - perlite filled cores", group: "Masonry/Concrete Block", thickness: 0.15, conductivity: 0.33, density: 1390, specificHeat: 880, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_low_mass_aggregate_7_3_7_7_kg_2_or_3_cores_vermiculite_filled_cores": { name: "Concrete Block: Low Mass Aggregate: 7.3-7.7 kg - 2 or 3 cores - vermiculite filled cores", group: "Masonry/Concrete Block", thickness: 0.15, conductivity: 0.33, density: 1390, specificHeat: 880, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_low_mass_aggregate_8_6_10_0_kg": { name: "Concrete Block: Low Mass Aggregate: 8.6-10.0 kg", group: "Masonry/Concrete Block", thickness: 0.2, conductivity: 0.33, density: 1380, specificHeat: 880, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_low_mass_aggregate_8_6_10_0_kg_perlite_filled_cores": { name: "Concrete Block: Low Mass Aggregate: 8.6-10.0 kg - perlite filled cores", group: "Masonry/Concrete Block", thickness: 0.2, conductivity: 0.33, density: 1380, specificHeat: 880, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_low_mass_aggregate_8_6_10_0_kg_vermiculite_filled_cores": { name: "Concrete Block: Low Mass Aggregate: 8.6-10.0 kg - vermiculite filled cores", group: "Masonry/Concrete Block", thickness: 0.2, conductivity: 0.33, density: 1380, specificHeat: 880, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_low_mass_aggregate_8_6_10_0_kg_molded_eps_beads_filled_cores": { name: "Concrete Block: Low Mass Aggregate: 8.6-10.0 kg - molded EPS (beads) filled cores", group: "Masonry/Concrete Block", thickness: 0.2, conductivity: 0.33, density: 1380, specificHeat: 880, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_low_mass_aggregate_8_6_10_0_kg_uf_foam_filled_cores": { name: "Concrete Block: Low Mass Aggregate: 8.6-10.0 kg - UF foam filled cores", group: "Masonry/Concrete Block", thickness: 0.2, conductivity: 0.33, density: 1380, specificHeat: 880, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_low_mass_aggregate_8_6_10_0_kg_molded_eps_inserts_in_cores": { name: "Concrete Block: Low Mass Aggregate: 8.6-10.0 kg - molded EPS inserts in cores", group: "Masonry/Concrete Block", thickness: 0.2, conductivity: 0.33, density: 1380, specificHeat: 880, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_low_mass_aggregate_14_5_16_3_kg_2_or_3_cores": { name: "Concrete Block: Low Mass Aggregate: 14.5-16.3 kg - 2 or 3 cores", group: "Masonry/Concrete Block", thickness: 0.3, conductivity: 0.33, density: 1440, specificHeat: 880, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_low_mass_aggregate_14_5_16_3_kg_2_or_3_cores_perlite_filled_cores": { name: "Concrete Block: Low Mass Aggregate: 14.5-16.3 kg - 2 or 3 cores - perlite filled cores", group: "Masonry/Concrete Block", thickness: 0.3, conductivity: 0.33, density: 1440, specificHeat: 880, alpha: 0.65, eps: 0.9 }, 
    "concrete_block_low_mass_aggregate_14_5_16_3_kg_2_or_3_cores_vermiculite_filled_cores": { name: "Concrete Block: Low Mass Aggregate: 14.5-16.3 kg - 2 or 3 cores - vermiculite filled cores", group: "Masonry/Concrete Block", thickness: 0.3, conductivity: 0.33, density: 1440, specificHeat: 880, alpha: 0.65, eps: 0.9}
};

const SMOOTH_SURFACE_GROUPS = new Set(['Glass', 'Metals']);
const SMOOTH_SURFACE_KEYS = new Set([
  'facade_glass_dark',
  'facade_alum_polished',
  'roof_metal_galv',
  'roof_cool_coated',
  'f08_metal_surface',
  'f09_opaque_spandrel_glass'
]);

function isSmoothSurfaceMaterial(materialKey, materialInfo) {
  if (SMOOTH_SURFACE_KEYS.has(materialKey)) return true;
  if (materialInfo && SMOOTH_SURFACE_GROUPS.has(materialInfo.group)) return true;
  return false;
}

function getActiveMaterialInfo() {
  if (state.maState.mode === 'mass') {
    const key = state.maState.massPreset;
    return { key, info: thermalMassPresets[key] };
  }
  const key = state.maState.preset;
  return { key, info: materialPresets[key] };
}

export function getExternalConvectionCoefficient(windSpeed, materialKey, materialInfo) {
  const V = Math.max(windSpeed || 0, 0);
  const active = materialKey !== undefined ? { key: materialKey, info: materialInfo } : getActiveMaterialInfo();
  const smooth = isSmoothSurfaceMaterial(active.key, active.info);

  let m, n, p;
  if (V < 4.88) {
    m = smooth ? 0.99 : 1.09;
    n = smooth ? 0.21 : 0.23;
    p = 1;
  } else {
    m = 0;
    n = smooth ? 0.50 : 0.53;
    p = 0.78;
  }

  const hc = 5.678 * (m + n * Math.pow(V / 0.3048, p));
  return Math.max(hc, 5.0);
}

export function computeMaterialTemperatures(epwData) {
  const loc = epwData.metadata.location || epwData.metadata;
  const lat = loc.latitude;
  const lon = loc.longitude;

  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    console.warn('[material-physics] computeMaterialTemperatures: missing/invalid latitude or longitude in EPW metadata. Skipping surface temperature calculation (ma_TSurf will remain undefined for all records).');
    return;
  }

  const tiltRad = state.maState.tilt * (Math.PI / 180);
  const surfAzRad = state.maState.azimuth * (Math.PI / 180);

  epwData.data.forEach(d => {
    if (!(d.datetime instanceof Date) || isNaN(d.datetime.valueOf())) return;

    const sunPos = SunCalc.getPosition(d.datetime, lat, lon);
    const sunAltRad = sunPos.altitude * Math.PI / 180;
    const sunAzRad = sunPos.azimuth * Math.PI / 180;

    let cosTheta = 0;
    if (sunPos.altitude > 0) {
      cosTheta = Math.sin(sunAltRad) * Math.cos(tiltRad) + Math.cos(sunAltRad) * Math.sin(tiltRad) * Math.cos(sunAzRad - surfAzRad);
    }

    let incidentDirect = 0;
    if (cosTheta > 0 && sunPos.altitude > 0) {
      incidentDirect = d.directNormalRadiation * cosTheta;
    }

    const incidentDiffuse = d.diffuseHorizontalRadiation * ((1 + Math.cos(tiltRad)) / 2) * state.maState.svf;
    const incidentReflected = ((d.directNormalRadiation * Math.sin(Math.max(sunAltRad, 0))) + d.diffuseHorizontalRadiation) * state.maState.albedoGround * ((1 - Math.cos(tiltRad)) / 2);

    const iTotal = incidentDirect + incidentDiffuse + incidentReflected;

    const tAir = d.dryBulbTemperature;

    const tSkyK = getEffectiveSkyTemperatureK(tAir, d.dewPointTemperature, d.horizontalInfraredRadiationIntensity, d.opaqueSkyCover);

    const ho = getExternalConvectionCoefficient(d.windSpeed);
    const viewFactor = ((1 + Math.cos(tiltRad)) / 2) * state.maState.svf;

    const tSurf = solveSteadyStateSurfaceTemperature(tAir, tSkyK, state.maState.alpha, state.maState.eps, iTotal, ho, viewFactor);

    d.ma_TSurf = tSurf;
    d.ma_DeltaT = tSurf - tAir;
    d.ma_ITotal = iTotal;
  });
}

export function computeThermalMass1D(epwData) {
  const N = 10;

  if (!epwData.data.length || epwData.data[0].ma_TSurf === undefined) {
    console.warn('[material-physics] computeThermalMass1D: ma_TSurf is undefined (computeMaterialTemperatures did not run or failed, e.g. due to invalid latitude/longitude). Skipping thermal mass calculation.');
    return;
  }

  const thickness = Math.max(state.maState.thickness, 0.001);
  const density = Math.max(state.maState.density, 1);
  const specificHeat = Math.max(state.maState.specificHeat, 1);
  const conductivity = Math.max(state.maState.conductivity, 0.001);

  const dx = thickness / (N - 1);
  const alpha_diff = conductivity / (density * specificHeat);

  let maxWind = 0;
  epwData.data.forEach(d => {
    if (d.windSpeed > maxWind) maxWind = d.windSpeed;
  });
  const h_max = Math.max(getExternalConvectionCoefficient(maxWind), 8.3);

  const dt_max_cond = (dx * dx) / (2 * alpha_diff);
  const dt_max_conv = 1 / ((2 * alpha_diff / (dx * dx)) + (2 * h_max / (density * specificHeat * dx)));

  let dt = Math.min(dt_max_cond, dt_max_conv) * 0.75;

  let M = Math.ceil(3600 / dt);
  if (M > 36000) M = 36000;
  dt = 3600 / M;

  let T = new Array(N).fill(20);
  const Tin_bnd = 22;
  const hin = 8.3;

  const MAX_PASSES = 6;
  const CONVERGENCE_TOL_C = 0.05;
  let prevPassEndT = null;
  let converged = false;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    epwData.data.forEach(d => {
      const Tsa = d.ma_TSurf;
      const hout = getExternalConvectionCoefficient(d.windSpeed);

      for (let step = 0; step < M; step++) {
        let T_new = new Array(N);

        T_new[0] = T[0] + (dt / (density * specificHeat * dx / 2)) *
          (hout * (Tsa - T[0]) - (conductivity / dx) * (T[0] - T[1]));

        for (let i = 1; i < N - 1; i++) {
          T_new[i] = T[i] + (alpha_diff * dt / (dx * dx)) * (T[i - 1] - 2 * T[i] + T[i + 1]);
        }

        T_new[N - 1] = T[N - 1] + (dt / (density * specificHeat * dx / 2)) *
          ((conductivity / dx) * (T[N - 2] - T[N - 1]) - hin * (T[N - 1] - Tin_bnd));

        T = T_new;
      }

      if (pass >= 1) {
        d.ma_TOutMass = T[0];
        d.ma_TInMass = T[N - 1];
        d.ma_TMassNodes = [...T];
      }
    });

    if (pass >= 1) {
      if (prevPassEndT) {
        let maxDelta = 0;
        for (let i = 0; i < N; i++) maxDelta = Math.max(maxDelta, Math.abs(T[i] - prevPassEndT[i]));
        if (maxDelta < CONVERGENCE_TOL_C) converged = true;
      }
      prevPassEndT = [...T];
      if (converged) break;
    }
  }

  if (!converged) {
    console.warn(`[material-physics] computeThermalMass1D: periodic steady-state not reached within ${MAX_PASSES} passes (tolerance ${CONVERGENCE_TOL_C} deg C). Results reflect the best available approximation but may retain some initial-condition drift for very thick/dense materials.`);
  }
}