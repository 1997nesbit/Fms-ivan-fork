# **Furniture Management System**

## **SKU Naming Convention — Reference Document**

**Version:** 1.0 (Draft) | **Date:** June 2026 **Status:** Working draft — subject to change based on client confirmation

This document defines the Stock Keeping Unit (SKU) naming convention for all furniture items entering the shop/showroom system. Once finalised and confirmed by the client, this convention must be applied consistently across all branches, all stock entries, and all system records. No item should enter the system without a correctly formatted SKU.

![](data:image/png;base64...)

## **2. Segment Reference Tables**

### **2.1 Room / Category Code (2 characters)**

|  |  |
| --- | --- |
| **Code** | **Category** |
| DR | Dining Room |
| LR | Living Room / Lounge |
| BD | Bedroom |
| OF | Office |
| KT | Kitchen |
| OD | Outdoor / Garden |
| ST | Storage / General |
| EN | Entryway / Hallway |

### **2.2 Item Type Code (3 characters)**

|  |  |
| --- | --- |
| **Code** | **Item Type** |
| TBL | Table (dining, side, console) |
| CHR | Chair (dining chair, accent chair) |
| SFA | Sofa / Couch |
| BED | Bed frame |
| WRD | Wardrobe |
| DSK | Desk |
| CBS | Cabinet / Sideboard / Buffet |
| CFF | Coffee Table |
| TVU | TV Unit / Media Console |
| BNK | Bench |
| DRS | Dresser / Chest of Drawers |
| SHL | Shelving Unit / Bookshelf |
| OTM | Ottoman / Footstool |
| NGT | Nightstand / Bedside Table |
| BAR | Bar Unit / Bar Stool |
| STL | Stool (general) |

**Note:** New item type codes can be added as the range expands. Any new code must be added to this table before use — do not improvise codes in the system.

### **2.3 Set Flag + Number (1 letter + 3 digits)**

|  |  |  |
| --- | --- | --- |
| **Prefix** | **Meaning** | **Example** |
| S | Item is part of a named set | S001, S014, S103 |
| X | Item is standalone (not part of any set) | X001, X047, X200 |

Numbers run from 001 upward per branch. Branch A and Branch B each have their own numbering sequence — SET-A-001 and SET-B-001 are two different sets.

### **2.4 Component Code (set items only)**

Used only when the item belongs to a set (prefix S). Standalone items (prefix X) do not use a component code.

|  |  |
| --- | --- |
| **Code** | **Component** |
| T | Main table |
| C1, C2, C3... | Chair 1, Chair 2, Chair 3 (numbered sequentially) |
| B | Bench |
| M | Main / primary sofa or centrepiece |
| L | Left section (e.g. left sofa arm) |
| R | Right section (e.g. right sofa arm) |
| S | Secondary / side piece |
| HB | Headboard |
| FB | Footboard |
| NG | Nightstand (within a bedroom set) |
| DRS | Dresser (within a bedroom set) |
| MIR | Mirror (within a bedroom or dresser set) |
| CBS | Cabinet or sideboard (within a dining set) |

**Note:** Component codes expand as needed for new set types. When a new set type is created, define and document its component codes before the set enters the system.

### **2.5 Branch Code (1 character)**

|  |  |
| --- | --- |
| **Code** | **Branch** |
| A | Branch A (Main / first location) |
| B | Branch B |
| C | Branch C |
| ... | Expands as new branches open |

Branch codes are assigned in the order branches are opened. A branch code, once assigned, never changes — even if the branch relocates or is renamed.

## **3. The SET Parent Record**

Every set has a parent record in the system. The parent record is not a physical item — it is the grouping that ties all components together. Its ID format is:

[ROOM]-SET-S[NUMBER]-[BRANCH]

**Example:** DR-SET-S001-A

The parent record holds: set name, status (Available / Broken / Sold / Reserved / Transferred), full set price, branch, date entered into showroom, and links to all component SKUs.

## **4. Full SKU Examples**

### **Dining Room Set — Branch A (Set 001)**

|  |  |  |
| --- | --- | --- |
| **Record** | **SKU** | **Description** |
| SET parent | DR-SET-S001-A | Dining Room Set 001, Branch A |
| Dining table | DR-TBL-S001-T-A | Table component of set 001 |
| Chair 1 | DR-CHR-S001-C1-A | Chair 1 of set 001 |
| Chair 2 | DR-CHR-S001-C2-A | Chair 2 of set 001 |
| Chair 3 | DR-CHR-S001-C3-A | Chair 3 of set 001 |
| Chair 4 | DR-CHR-S001-C4-A | Chair 4 of set 001 |
| Sideboard | DR-CBS-S001-CBS-A | Sideboard component of set 001 |

### **Living Room 3-Piece Suite — Branch B (Set 003)**

|  |  |  |
| --- | --- | --- |
| **Record** | **SKU** | **Description** |
| SET parent | LR-SET-S003-B | Living Room Suite 003, Branch B |
| Main sofa | LR-SFA-S003-M-B | Main sofa of suite 003 |
| Left armchair | LR-CHR-S003-L-B | Left chair of suite 003 |
| Right armchair | LR-CHR-S003-R-B | Right chair of suite 003 |

### **Bedroom Set — Branch A (Set 007)**

|  |  |  |
| --- | --- | --- |
| **Record** | **SKU** | **Description** |
| SET parent | BD-SET-S007-A | Bedroom Set 007, Branch A |
| Bed frame | BD-BED-S007-M-A | Main bed frame of set 007 |
| Headboard | BD-BED-S007-HB-A | Headboard of set 007 |
| Dresser | BD-DRS-S007-DRS-A | Dresser of set 007 |
| Mirror | BD-DRS-S007-MIR-A | Mirror of set 007 |
| Left nightstand | BD-NGT-S007-L-A | Left nightstand of set 007 |
| Right nightstand | BD-NGT-S007-R-A | Right nightstand of set 007 |

### **Standalone Items (No Set)**

|  |  |
| --- | --- |
| **SKU** | **Description** |
| BD-WRD-X047-B | Standalone wardrobe, item 047, Branch B |
| OF-DSK-X008-A | Standalone office desk, item 008, Branch A |
| LR-CFF-X021-A | Standalone coffee table, item 021, Branch A |
| OD-TBL-X003-B | Standalone outdoor table, item 003, Branch B |

## **5. Rules**

**Rule 1 — SKUs are permanent.** Once assigned, a SKU never changes. Even if a set is broken, items are transferred to another branch, or pieces are repriced, the SKU stays the same. Only the status in the system changes.

**Rule 2 — No item enters the system without a SKU.** The Operations Manager or Director assigns the SKU at the point of stock entry. Front desk staff sell items by selecting their SKU — they do not create or modify SKUs.

**Rule 3 — Branch numbers are independent.** Each branch runs its own numbering sequence for sets and standalone items. SET-A-001 and SET-B-001 are two completely different sets. The branch code in the SKU is what distinguishes them.

**Rule 4 — Component codes must be defined before a new set type is entered.** If a new set type is being entered (e.g. a kitchen set that hasn't been done before), the Director or Ops Manager must define the component codes for that set type and add them to this document before assigning SKUs.

**Rule 5 — Broken sets keep their original SKUs.** When a Director breaks a set, the remaining component items keep their exact original SKUs. The system marks them as *"Available — ex-set [parent ID]"*. No renaming, no new codes.

**Rule 6 — New codes require sign-off.** Any new room code, item type code, or component code must be agreed and added to this document before use. No improvised codes in the system.

## **6. Quick Reference Card**

*This document is a working draft. Final version to be confirmed with client before system build. All codes and conventions are subject to revision.*

![](data:image/png;base64...)