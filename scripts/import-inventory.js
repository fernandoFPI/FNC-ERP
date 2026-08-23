#!/usr/bin/env node
/**
 * Store Inventory Excel Import Script
 *
 * Usage:
 *   node scripts/import-inventory.js \
 *     --file "Store Inventory 2025.xlsx" \
 *     --company-id <uuid> \
 *     --location-id <uuid> \
 *     [--dry-run]
 *
 * Requires:  xlsx   (npm install xlsx)
 *            pg     (already a project dependency)
 *
 * What it does:
 *   - Reads every store sheet in the Excel file (English template names or the
 *     Arabic warehouse tab names used in real stock-count workbooks)
 *   - Sheet name  →  sub_category  (e.g. "Steel Store")
 *   - category is always "raw_material"
 *   - Auto-generates SKU as PREFIX-NNN  (e.g. STEEL-001)
 *   - Upserts products ON CONFLICT (company_id, sku) → UPDATE
 *   - Upserts stock_balances for the chosen location ON CONFLICT → UPDATE qty_on_hand
 *   - Zero-qty rows are still imported as products with 0 balance
 *   - Sheets that can't be recognised are reported, not silently dropped
 */

const XLSX = require('xlsx')
const { Client } = require('pg')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(name) {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : null
}
const FILE       = getArg('--file')       || 'Store Inventory 2025.xlsx'
const COMPANY_ID = getArg('--company-id')
const LOCATION_ID= getArg('--location-id')
const DRY_RUN    = args.includes('--dry-run')

if (!COMPANY_ID || !LOCATION_ID) {
  console.error('Usage: node scripts/import-inventory.js --file <path> --company-id <uuid> --location-id <uuid> [--dry-run]')
  process.exit(1)
}

// ─── Sheet name -> product category ──────────────────────────────────────────
// Lookups are matched after normalizeKey(), so stray/inconsistent whitespace in
// a workbook's tab name (e.g. the real template's "Work Tools Store   " with
// trailing spaces) doesn't cause a silent mismatch.
const CATEGORY_BY_SHEET = {
  // Canonical English sheet names from the official "Store Inventory" template
  'Steel Store':                    { prefix: 'STEEL', subCat: 'Steel Store' },
  'General Store':                  { prefix: 'GEN',   subCat: 'General Store' },
  'Electrical Equipment Store':     { prefix: 'ELEC',  subCat: 'Electrical Equipment Store' },
  'Plumbing Store':                 { prefix: 'PLMB',  subCat: 'Plumbing Store' },
  'PVC Store':                      { prefix: 'PVC',   subCat: 'PVC Store' },
  'Paint Store':                    { prefix: 'PAINT', subCat: 'Paint Store' },
  'AC Unit Store':                  { prefix: 'AC',    subCat: 'AC Unit Store' },
  'Furniture Store':                { prefix: 'FURN',  subCat: 'Furniture Store' },
  'Work Tools Store':               { prefix: 'TOOL',  subCat: 'Work Tools Store' },
  'Sandwich , Plywood ,Vinyl':      { prefix: 'SPV',   subCat: 'Sandwich, Plywood, Vinyl' },
  'Safety Store':                   { prefix: 'SAFE',  subCat: 'Safety Store' },
  'General Construction Store':     { prefix: 'CONST', subCat: 'General Construction Store' },
  'Cleaning Materials Store':       { prefix: 'CLEAN', subCat: 'Cleaning Materials Store' },
  'Outside Area Cables':            { prefix: 'CABLE', subCat: 'Outside Area Cables' },

  // Arabic warehouse tab names, as used in real store stock-count workbooks,
  // aliased onto the same categories as above
  'صحيات':               { prefix: 'PLMB',  subCat: 'Plumbing Store' },
  'صبغ':                 { prefix: 'PAINT', subCat: 'Paint Store' },
  'مخزن سبالت':          { prefix: 'AC',    subCat: 'AC Unit Store' },
  'مخزن مواد عامة':      { prefix: 'GEN',   subCat: 'General Store' },
  'مخزن كهرباء':         { prefix: 'ELEC',  subCat: 'Electrical Equipment Store' },
  'ساندويج بنل':         { prefix: 'SPV',   subCat: 'Sandwich, Plywood, Vinyl' },
  'حديد':                { prefix: 'STEEL', subCat: 'Steel Store' },

  // Warehouse categories with no equivalent in the original 14-sheet template
  'بي في سي و المنيوم':      { prefix: 'PVCAL', subCat: 'PVC & Aluminum Store' },
  'دكتات':                   { prefix: 'DUCT',  subCat: 'Ducts Store' },
  'ابواب حديد':              { prefix: 'DOOR',  subCat: 'Iron Doors Store' },
  'معمل':                    { prefix: 'FACT',  subCat: 'Factory Store' },
  'فريم':                    { prefix: 'FRAME', subCat: 'Frame Store' },
  'بوردات حديد قديمة':       { prefix: 'OIB',   subCat: 'Old Iron Boards Store' },
}

const normalizeKey = (s) => s.replace(/\s+/g, ' ').trim()

const CATEGORY_LOOKUP = Object.fromEntries(
  Object.entries(CATEGORY_BY_SHEET).map(([sheetName, info]) => [normalizeKey(sheetName), info]),
)

// Best-effort English translations for material names that exist only in Arabic
// in some warehouse sheets (Ducts, Iron Doors and Old Iron Boards have no English
// "Subject Name" column at all). Keyed by the normalized Arabic name. Anything not
// found here just falls back to the Arabic text as the product name — never blocked.
const AR_EN_TRANSLATIONS = {
  // Ducts (دكتات)
  'دكت طول 200سم قياس 15*15سم من صفحتين مفتوح مع وجود بوري من صفحة واحدة قطر البوري 4 انج':
    'Duct, 200cm length, 15x15cm, open on two sides, one 4in vent on one side',
  'دكت طول 200 سم قياس 15*15 سم مفتوح من صفحة و صفحة ثانية مغلق مع وجود بوري عدد 1 قطر 4 انج':
    'Duct, 200cm length, 15x15cm, open on one side and closed on the other, 1 vent 4in diameter',
  'دكت طول 178 سم قياس 15*15 سم مفتوح من طرفين مع وجود بوري عدد 1 قطر 4 انج':
    'Duct, 178cm length, 15x15cm, open on both ends, 1 vent 4in diameter',
  'دكت طول 200 سم قياس 15*15 سم مفتوح من صفحتين': 'Duct, 200cm length, 15x15cm, open on both sides',
  'دكت طول177 سم قياس 15*15 سم مفتوح من صفحتين': 'Duct, 177cm length, 15x15cm, open on both sides',
  'دكت 10*15 سم طول 200 سم مفتوح من طرفين': 'Duct, 10x15cm, 200cm length, open on both ends',
  'مصغيرة دكت قياس (15*10)(15*15) مفتوح من طرفين مع بوري طول 130 سم':
    'Duct reducer, 15x10cm to 15x15cm, open on both ends, with vent, 130cm length',
  'دكت 15*15 سم مفتوح ن صفحة واحدة فقط طول 200 سم مع وجد بوري مربع 15*15 سم من جهة المغلقة':
    'Duct, 15x15cm, open on one side only, 200cm length, with a 15x15cm square vent on the closed side',
  'مصغيرة دكت وجود بوري من جهة الامامية قطر 10 انج قياس المصغيرة (34*29)(30*15) طول 130 سم':
    'Duct reducer, front vent 10in diameter, 34x29cm to 30x15cm, 130cm length',
  'مصغيرة دكت مع بوري مربع قياس 15*15 سم من الاعلى طول 100 سم (25*15)(15*15)':
    'Duct reducer with a 15x15cm square vent on top, 100cm length, 25x15cm to 15x15cm',
  'مصغيرة دكت مع بوري مربع قياس 15*15 سم من الاعلى طول 100 سم مفتوح من طرفين (25*15)(30*15)':
    'Duct reducer with a 15x15cm square vent on top, 100cm length, open on both ends, 25x15cm to 30x15cm',
  'دكت طول 200 سم قياس 15*15 سم من جهة الامامية و من جهة الخلفية يوجد بوري قطر 4 انج':
    'Duct, 200cm length, 15x15cm, 4in vents on front and back sides',
  'دكت 15*10 سم طول 200 سم مع بوري عدد1 قطر 4 انج مسدود من جهة واحدة فقط':
    'Duct, 15x10cm, 200cm length, 1 vent 4in diameter, closed on one side only',
  'دكت 15*10 سم طول 200 سم مع بوري عدد1 قطر 4 انج مفتوح من طرفين':
    'Duct, 15x10cm, 200cm length, 1 vent 4in diameter, open on both ends',
  'دكت قياس 34*29.5 سم طول 120 سم مسدود من صفحة واحدة الامامية و من صفحة الخلفية يوجد بوري قطر 10 انج و مع وجود بوري من صفحة اليمين و اليسار قياس 10 انج':
    'Duct, 34x29.5cm, 120cm length, closed on the front side, 10in vent on the back and on the right/left sides',
  'مصغيرة دكت طول 150 سم (20*25) من صفحة و صفحة ثانية يوجود بوري قطر 10 انج مع وجود بوري عدد 2 من صفحات قطر 6 انج':
    'Duct reducer, 150cm length, 20x25cm, 10in vent on one side and 2 more 6in vents on other sides',
  'دكت مفتوح من طرفين طول 200 سم 25*15 سم': 'Duct, open on both ends, 200cm length, 25x15cm',
  'دكت مفتوح من طرفين طول 200 سم 30*15 سم': 'Duct, open on both ends, 200cm length, 30x15cm',
  'دكت 20*25 سم مسدود من صفحة و من صفحة ثانية يوجد بوري قطر 6 انج طول 200 سم':
    'Duct, 20x25cm, closed on one side with a 6in vent on the other, 200cm length',

  // Iron doors (ابواب حديد)
  'باب حديد سنكل قياس 91*206 سم سمك الباب 6 سم يدة على يسار النرمادة على يمين بودون كفر بدون يدة يوجد مشاكل في صبغ يوجد ظربات في الباب (باب رقم 1)':
    'Single iron door, 91x206cm, thickness 6cm, handle on left, frame on right, no cover, no handle, paint issues, dents on the door (door #1)',
  'باب حديد سنكل قياس 91*206 سم سمك الباب 6 سم يدة على يسار النرمادة على يمين بودون كفر بدون يدة (باب رقم2)':
    'Single iron door, 91x206cm, thickness 6cm, handle on left, frame on right, no cover, no handle (door #2)',
  'باب حديد سنكل قياس 91*206 سم سمك الباب 6 سم يدة على يسار النرمادة على يمين بودون كفر بدون يدة يوجد ظربات قليلة في صبغ يحتاج الى صبغ قليل (باب رقم3)':
    'Single iron door, 91x206cm, thickness 6cm, handle on left, frame on right, no cover, no handle, a few paint scuffs, needs minor repainting (door #3)',
  'باب حديد سنكل 87*205 سم سمك 14 سم يدة على يمين و النرمادة على يسار يحتوي على بوش بار بدون يدةيوجد ظرر قليل في الملبن و ظربة في الكفر يمكن استعمال الباب لي سمك 5 سم بس لازم تصنيع كفر حديد او بلاستك (باب رقم 4)':
    'Single iron door, 87x205cm, thickness 14cm, handle on right, frame on left, has a push bar, no handle, slight damage on the jamb and a dent on the cover; usable for 5cm walls but needs a new iron/plastic cover made (door #4)',
  'باب حديد سنكل 100*210 سم سمك 10 سم لازم ينشد بوش بار او معالجة مكان براغي مال بوش بار يدة على يمين و النرمادة على يسار الباب جديد فقط مشدود كنموذج كي بي ار هذا الباب لازم كيلون دبل مثل كي بي ار (رقم 5)':
    'Single iron door, 100x210cm, thickness 10cm, push bar needs tightening or its screw holes repaired, handle on right, frame on left; new door, only assembled as a KPR sample — needs a double lock like the KPR one (door #5)',
  'باب حديد سنكل 95.5*205 سم سمك 6 سم اليدة على يمين و النرمادة على يسار باب مستعمل يوجد في الباب بوش بار عامودي+ افقي (رقم 6)':
    'Single iron door, 95.5x205cm, thickness 6cm, handle on right, frame on left, used door, has vertical + horizontal push bar (door #6)',
  'باب حديد سنكل 91*203 سم سمك 5-10 سم اليدة على يسار و نرمادة على يمين باب مستعمل نموذج لازم جك باب هيدروليك بدون جوزة و بدون يدة يحتاج الى صبغ مكان جك باب و بدون عتبة لحيم نرمادة غير جيد (رقم 7)':
    'Single iron door, 91x203cm, thickness 5-10cm, handle on left, frame on right, used sample door, needs a hydraulic door closer, no hinge sleeve, no handle, needs paint touch-up at the closer spot, no threshold, poor frame welding (door #7)',
  'باب حديد سنكل 88*214 سم سمك 5-10 سم يدة على يسار و النرمادة على يمين يحتاج الى جك باب هيدروليك او معالج مكان براغي جك باب (رقم8)':
    'Single iron door, 88x214cm, thickness 5-10cm, handle on left, frame on right, needs a hydraulic door closer or repair at the closer screw holes (door #8)',
  'باب حديد سنكل 88*214 سم سمك باب 5-10 سم يدة على يسار و نرمادة على يمين يحتاج الى تعويج حديد او زاوية بلاستك في حالة تم استعمال لجدار سمك 5 سم يحتاج الى جك باب في حالة عدم استعمال جك يجب معالج مكان براغي جك (رقم 9)':
    'Single iron door, 88x214cm, thickness 5-10cm, handle on left, frame on right, needs iron bending or a plastic corner; if used on a 5cm wall needs a door closer, otherwise repair the closer screw holes (door #9)',
  'باب حديد سنكل 100*205 سم سمك 10-15 سم يدة على يسار و النرمادة على يمين يوجد زنجار بدون يدة و لاكيلون و مكان الكيلون غير محفور على باب سمك الفردة 6 سم (رقم 10)':
    'Single iron door, 100x205cm, thickness 10-15cm, handle on left, frame on right, has rust, no handle, no lock cylinder, cylinder hole not drilled, leaf thickness 6cm (door #10)',
  'باب حديد سنكل 100*205 سم سمك 10-15 سم يدة على يسار و النرمادة على يمين يوجد زنجار بدون يدة و لاكيلون و مكان الكيلون غير محفور على باب سمك الفردة 6 سم (رقم 11)':
    'Single iron door, 100x205cm, thickness 10-15cm, handle on left, frame on right, has rust, no handle, no lock cylinder, cylinder hole not drilled, leaf thickness 6cm (door #11)',
  'باب حديد سنكل 100*205 سم سمك 10-15 سم يدة على يسار و النرمادة على يمين يوجد زنجار بدون يدة و لاكيلون و مكان الكيلون غير محفور على باب سمك الفردة 6 سم (رقم 12)':
    'Single iron door, 100x205cm, thickness 10-15cm, handle on left, frame on right, has rust, no handle, no lock cylinder, cylinder hole not drilled, leaf thickness 6cm (door #12)',
  'باب حديد سنكل 100*205 سم سمك 10-15 سم يدة على يسار و النرمادة على يمين يوجد زنجار بدون يدة و لاكيلون و مكان الكيلون غير محفور على باب سمك الفردة 6 سم (رقم 13)':
    'Single iron door, 100x205cm, thickness 10-15cm, handle on left, frame on right, has rust, no handle, no lock cylinder, cylinder hole not drilled, leaf thickness 6cm (door #13)',
  'باب حديد سنكل 100*205 سم سمك 10-15 سم يدة على يسار و النرمادة على يمين يوجد زنجار بدون يدة و لاكيلون و مكان الكيلون غير محفور على باب سمك الفردة 6 سم يوجد ظربات بل باب قليلة بل فردة (رقم 14)':
    'Single iron door, 100x205cm, thickness 10-15cm, handle on left, frame on right, has rust, no handle, no lock cylinder, cylinder hole not drilled, leaf thickness 6cm, a few minor dents on the leaf (door #14)',
  'باب حديد سنكل 100*205 سم سمك 10-15 سم يدة على يسار و النرمادة على يمين يوجد زنجار بدون يدة و لاكيلون و مكان الكيلون غير محفور على باب سمك الفردة 6 سم يرجد ظربات بصبغ نرمادة بي ظربات قليلة بل فردة (رقم 15)':
    'Single iron door, 100x205cm, thickness 10-15cm, handle on left, frame on right, has rust, no handle, no lock cylinder, cylinder hole not drilled, leaf thickness 6cm, paint scuffs on the frame and a few minor dents on the leaf (door #15)',
  'باب حديد سنكل 100*205 سم سمك 10-15 سم يدة على يسار و النرمادة على يمين يوجد زنجار بدون يدة و لاكيلون و مكان الكيلون غير محفور على باب سمك الفردة 6 سم يوجد ظربا في الفردة حسب الفيديو (رقم 16)':
    'Single iron door, 100x205cm, thickness 10-15cm, handle on left, frame on right, has rust, no handle, no lock cylinder, cylinder hole not drilled, leaf thickness 6cm, dent on the leaf as shown in the video (door #16)',
  'باب حديد سنكل 100*205 سم سمك 10-15 سم يدة على يسار و النرمادة على يمين يوجد زنجار بدون يدة و لاكيلون و مكان الكيلون غير محفور على باب سمك الفردة 6 سم يوجد ظربات بسيطة في الفردة حسب الفيديو(رقم 17)':
    'Single iron door, 100x205cm, thickness 10-15cm, handle on left, frame on right, has rust, no handle, no lock cylinder, cylinder hole not drilled, leaf thickness 6cm, minor dents on the leaf as shown in the video (door #17)',
  'باب حديد سنكل 97*205 سم سمك 10سم اليدة على يمين و النرمادة على يسار بدون كفر مكان يدة غير مفتوح و يحتاج الى قليل من تعديل في صبغ حسب الفيديو (رقم 18)':
    'Single iron door, 97x205cm, thickness 10cm, handle on right, frame on left, no cover, handle cutout not opened, needs minor paint touch-up as shown in the video (door #18)',
  'باب جديد سنكل 93*204 سمك 5 سم مع بوش بار و كفر (رقم19)':
    'New single door, 93x204cm, thickness 5cm, with push bar and cover (door #19)',
  'باب حديد سنكل 96*205 سمك 5 سم بدون كفر (رقم20)':
    'Single iron door, 96x205cm, thickness 5cm, no cover (door #20)',
  'باب حديد دبل 180*205 سمك 5سم فمافوق الفرد على يمين متحرك على يسار بيه سركي يعني ثابت بدون كفر (رقم21)':
    'Double iron door, 180x205cm, thickness 5cm and up, active leaf on right, fixed leaf on left, no cover (door #21)',
  'باب حديد دبل 180*205 سمك 5سم فمافوق الفرد على يمين متحرك على يسار بيه سركي يعني ثابت بدون كفر (رقم22)':
    'Double iron door, 180x205cm, thickness 5cm and up, active leaf on right, fixed leaf on left, no cover (door #22)',
  'باب حديد دبل 180*205 سمك 5سم فمافوق الفرد على يمين متحرك على يسار بيه سركي يعني ثابت بدون كفر (رقم23)':
    'Double iron door, 180x205cm, thickness 5cm and up, active leaf on right, fixed leaf on left, no cover (door #23)',
  'باب حديد دبل 180*205 سمك 5سم فمافوق الفرد على يمين متحرك على يسار بيه سركي يعني ثابت بدون كفر (رقم24)':
    'Double iron door, 180x205cm, thickness 5cm and up, active leaf on right, fixed leaf on left, no cover (door #24)',
  'باب حديد دبل 180*205 سمك 5سم فمافوق الفرد على يمين متحرك على يسار بيه سركي يعني ثابت بدون كفر (رقم25)':
    'Double iron door, 180x205cm, thickness 5cm and up, active leaf on right, fixed leaf on left, no cover (door #25)',
  'باب حديد دبل 180*205 سمك 5سم فمافوق الفرد على يمين متحرك على يسار بيه سركي يعني ثابت بدون كفر (رقم26)':
    'Double iron door, 180x205cm, thickness 5cm and up, active leaf on right, fixed leaf on left, no cover (door #26)',
  'باب حديد دبل 180*205 سمك 10سم الفرد على يمين متحرك على يسار بيه سركي يعني ثابت بدون كفر (رقم27)':
    'Double iron door, 180x205cm, thickness 10cm, active leaf on right, fixed leaf on left, no cover (door #27)',
  'باب حديد دبل 180*205 سمك 10سم الفرد على يمين متحرك على يسار بيه سركي يعني ثابت بدون كفر (رقم28)':
    'Double iron door, 180x205cm, thickness 10cm, active leaf on right, fixed leaf on left, no cover (door #28)',
  'باب حديد دبل 180*205 سمك 10سم الفرد على يمين متحرك على يسار بيه سركي يعني ثابت بدون كفر (رقم29)':
    'Double iron door, 180x205cm, thickness 10cm, active leaf on right, fixed leaf on left, no cover (door #29)',
  'باب حديد دبل 180*205 سمك10سم الفرد على يمين متحرك على يسار بيه سركي يعني ثابت بدون كفر (رقم30)':
    'Double iron door, 180x205cm, thickness 10cm, active leaf on right, fixed leaf on left, no cover (door #30)',
  'باب حديد دبل 180*205 سمك 10سم الفرد على يمين متحرك على يسار بيه سركي يعني ثابت بدون كفر (رقم31)':
    'Double iron door, 180x205cm, thickness 10cm, active leaf on right, fixed leaf on left, no cover (door #31)',
  'باب حديد سنكل صنع عراقي اتجاه يمين': 'Single iron door, Iraqi-made, right-handed',
  'باب حديد سنكل صنع عراقي اتجاه يسار': 'Single iron door, Iraqi-made, left-handed',

  // Old iron boards (بوردات حديد قديمة)
  'بورد حديد فارغ 77*83*55 سم (رقم1)': 'Empty iron panel, 77x83x55cm (panel #1)',
  'بورد حديد فارغ 77*83*55 سم (رقم2)': 'Empty iron panel, 77x83x55cm (panel #2)',
  'بورد حدي فارغ 97*60*90(رقم 3)': 'Empty iron panel, 97x60x90cm (panel #3)',
  'بورد حديد فارغ مع قاعدة حديد 77*45*90 سم(رقم 4)':
    'Empty iron panel with iron base, 77x45x90cm (panel #4)',
  'بورد حديد للمولدات 250 امبير (رقم 5)': 'Iron panel for generators, 250A (panel #5)',
  'بورد حديد للمودات 100 امبير (رقم6)': 'Iron panel for generators, 100A (panel #6)',
  'بورد حديد للمولدات 57*104*150 سم (رقم7)': 'Iron panel for generators, 57x104x150cm (panel #7)',
  'بورد حدي 130*46*107 سم (رقم8)': 'Iron panel, 130x46x107cm (panel #8)',
  'بورد حديد 77*46*94(رقم9)': 'Iron panel, 77x46x94cm (panel #9)',
  'بورد حديد 83*32*128 (رقم 10)': 'Iron panel, 83x32x128cm (panel #10)',
  'بورد حديد 156*46*149 (رقم11)تم سحب قاطع 250 امبير 3 بول عدد1 الى مولدة معمل':
    'Iron panel, 156x46x149cm (panel #11) — one 250A 3-pole breaker removed and sent to the factory generator',
  'بورد حديد 157*86*174( رقم12)': 'Iron panel, 157x86x174cm (panel #12)',
  'بورد حديد 157*66*189.5 (رقم13)': 'Iron panel, 157x66x189.5cm (panel #13)',
  'بورد حديد 96*60*89(رقم14)': 'Iron panel, 96x60x89cm (panel #14)',
  'بورد حديد 50*32*65 (رقم 15)': 'Iron panel, 50x32x65cm (panel #15)',
  'بورد حديد 50*32*65 (رقم 16)': 'Iron panel, 50x32x65cm (panel #16)',
  'بورد حديد 127*56*84(رقم 17)': 'Iron panel, 127x56x84cm (panel #17)',
  'بورد حديد 206*55*149(رقم18)': 'Iron panel, 206x55x149cm (panel #18)',
  'بورد حديد 156*55*149 (رقم19)': 'Iron panel, 156x55x149cm (panel #19)',
  'بورد حديد 96*46*145 (رقم 20) تم سحب قاطع 250 امبير و الى المطبعة بتاريخ 9/5/2026':
    'Iron panel, 96x46x145cm (panel #20) — 250A breaker removed and sent to the print shop on 2026-05-09',
}

// Every known sheet layout (template + real-world stock-count files) marks its
// header row by putting 'ت' ("No.") in the first cell — but the number of
// title/date rows above it varies (2 to 4), so we scan for it instead of
// assuming a fixed row offset.
function findHeaderRow(rows) {
  const scanLimit = Math.min(rows.length, 10)
  for (let i = 0; i < scanLimit; i++) {
    const first = rows[i] && rows[i][0]
    if (typeof first === 'string' && first.trim() === 'ت') return i
  }
  return -1
}

// Column order isn't consistent across sheets (some put Qty before Unit Price,
// some the reverse; some omit the English name column entirely), so columns are
// identified by header text/keywords instead of a fixed index.
function mapColumns(headerRow) {
  const map = {}
  for (let c = 0; c < headerRow.length; c++) {
    const raw = headerRow[c]
    if (raw == null) continue
    const text = String(raw).replace(/\s+/g, ' ').trim()
    if (!text) continue
    const lower = text.toLowerCase()

    if (map.englishName === undefined && lower.includes('subject name')) {
      map.englishName = c
      continue
    }
    if (
      map.unitCost === undefined &&
      (lower.includes('rate per unit') || lower.includes('unit price') || text.includes('القيمة'))
    ) {
      map.unitCost = c
      continue
    }
    if (
      map.qty === undefined &&
      (/\bqty\b/.test(lower) || text.includes('الكمية') || text.includes('جرد'))
    ) {
      map.qty = c
      continue
    }
    if (map.uom === undefined && (/\bunit\b/.test(lower) || text.includes('الوحدة'))) {
      map.uom = c
      continue
    }
    if (map.arabicName === undefined && text.includes('اسم المادة')) {
      map.arabicName = c
      continue
    }
  }
  return map.arabicName === undefined ? null : map
}

// ─── Parse Excel ─────────────────────────────────────────────────────────────
function parseExcel(filePath) {
  const wb = XLSX.readFile(filePath)
  const items = []
  const skipped = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
    const headerIdx = findHeaderRow(rows)
    if (headerIdx === -1) continue // e.g. a "Summary" sheet — no item table, nothing to report

    const category = CATEGORY_LOOKUP[normalizeKey(sheetName)]
    const colMap = mapColumns(rows[headerIdx])

    if (!colMap) {
      skipped.push({ sheet: sheetName, reason: 'Found a header row but no material-name column in it' })
      continue
    }
    if (!category) {
      skipped.push({
        sheet: sheetName,
        reason: "Has a valid item table but isn't mapped to a known product category",
      })
      continue
    }

    let seq = 1
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length === 0) continue

      const arabicName = String(row[colMap.arabicName] ?? '').trim()
      const englishName = colMap.englishName !== undefined ? String(row[colMap.englishName] ?? '').trim() : ''
      if (!arabicName && !englishName) continue

      const uom = (colMap.uom !== undefined ? String(row[colMap.uom] ?? '').trim() : '') || 'EA'
      const unitCost = colMap.unitCost !== undefined ? parseFloat(row[colMap.unitCost]) || 0 : 0
      const qty = colMap.qty !== undefined ? parseFloat(row[colMap.qty]) || 0 : 0

      const translated = arabicName ? AR_EN_TRANSLATIONS[normalizeKey(arabicName)] : undefined
      const name = englishName || translated || arabicName
      const description = arabicName && name !== arabicName ? arabicName : undefined
      const sku = `${category.prefix}-${String(seq).padStart(3, '0')}`
      seq++

      items.push({ sku, name, description, subCat: category.subCat, uom, unitCost, qty })
    }
  }

  return { items, skipped }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const filePath = path.resolve(FILE)
  console.log(`\n📂  Reading: ${filePath}`)
  const { items, skipped } = parseExcel(filePath)
  console.log(`📋  Parsed ${items.length} products across all store sheets`)

  if (skipped.length > 0) {
    console.log(`\n⚠️   ${skipped.length} sheet(s) could not be imported:`)
    skipped.forEach((s) => console.log(`   - ${s.sheet}: ${s.reason}`))
  }

  if (DRY_RUN) {
    console.log('\n🔍  DRY RUN — no changes will be written\n')
    items.slice(0, 10).forEach((it) =>
      console.log(`  [${it.sku}] ${it.name.substring(0, 50)}  qty=${it.qty}  cost=${it.unitCost}  store=${it.subCat}`)
    )
    if (items.length > 10) console.log(`  … and ${items.length - 10} more`)
    return
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  console.log('🔗  Connected to database\n')

  let created = 0, updated = 0, errors = 0

  await db.query('BEGIN')
  try {
    for (const item of items) {
      try {
        // Upsert product
        const res = await db.query(
          `INSERT INTO products
             (company_id, sku, name, description, category, sub_category, uom,
              valuation_method, standard_cost, average_cost, is_active)
           VALUES ($1,$2,$3,$4,'raw_material',$5,$6,'avco',$7,$7,true)
           ON CONFLICT (company_id, sku) DO UPDATE SET
             name          = EXCLUDED.name,
             description   = COALESCE(EXCLUDED.description, products.description),
             sub_category  = EXCLUDED.sub_category,
             uom           = EXCLUDED.uom,
             standard_cost = EXCLUDED.standard_cost,
             updated_at    = NOW()
           RETURNING id, xmax`,
          [COMPANY_ID, item.sku, item.name, item.description ?? null,
           item.subCat, item.uom, item.unitCost]
        )

        const row = res.rows[0]
        const productId = row.id
        const wasInsert = row.xmax === '0' || row.xmax === 0

        if (wasInsert) created++; else updated++

        // Upsert stock balance
        await db.query(
          `INSERT INTO stock_balances
             (product_id, location_id, lot_id, qty_on_hand, qty_reserved, average_cost, updated_at)
           VALUES ($1, $2, NULL, $3, 0, $4, NOW())
           ON CONFLICT (product_id, location_id, lot_id) DO UPDATE SET
             qty_on_hand  = EXCLUDED.qty_on_hand,
             average_cost = CASE WHEN EXCLUDED.average_cost > 0 THEN EXCLUDED.average_cost
                                 ELSE stock_balances.average_cost END,
             updated_at   = NOW()`,
          [productId, LOCATION_ID, item.qty, item.unitCost]
        )
      } catch (err) {
        console.error(`  ❌  [${item.sku}] ${item.name}: ${err.message}`)
        errors++
      }
    }

    await db.query('COMMIT')
  } catch (err) {
    await db.query('ROLLBACK')
    throw err
  } finally {
    await db.end()
  }

  console.log('✅  Import complete')
  console.log(`   Created : ${created}`)
  console.log(`   Updated : ${updated}`)
  console.log(`   Errors  : ${errors}`)
  console.log(`   Skipped sheets : ${skipped.length}`)
  console.log(`   Total   : ${items.length}`)
}

main().catch((err) => {
  console.error('\n💥  Fatal error:', err.message)
  process.exit(1)
})
