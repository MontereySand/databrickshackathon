/**
 * Seed guidance corpus. In LOCAL_SIM this is the retrieval surface that backs the
 * mocked AI Search adapter. In DATABRICKS mode the same content would live in
 * neelu.silver.guidance_chunks behind a Vector Search index.
 *
 * Content is a paraphrased, synthetic compendium of widely cited drinking-water
 * references for demo reasoning only. Neelu never certifies legal compliance.
 */

import type { TestType } from "../../shared/constants";

export interface GuidanceDoc {
  id: string;
  title: string;
  sourceName: string;
  sourceUri: string;
  appliesTo: TestType[] | "all";
  text: string;
  tags: string[];
}

export const GUIDANCE_DOCS: GuidanceDoc[] = [
  {
    id: "guidance-nitrate",
    title: "Nitrate in drinking water (reference value 10 mg/L as N)",
    sourceName: "EPA — Ground Water and Drinking Water",
    sourceUri: "https://www.epa.gov/ground-water-and-drinking-water/national-primary-drinking-water-regulations",
    appliesTo: ["nitrate"],
    text: "The commonly cited maximum contaminant level for nitrate is 10 mg/L (as nitrogen). Levels above this reference value are of particular concern for infants under six months and pregnant people, where nitrate can cause methemoglobinemia (\"blue baby syndrome\"). A field-kit exceedance should be treated as provisional and confirmed with an accredited laboratory sample before public-health action.",
    tags: ["nitrate", "infant", "school", "mcl", "confirm"],
  },
  {
    id: "guidance-coliform",
    title: "Total coliform and E. coli detections",
    sourceName: "WHO — Guidelines for Drinking-water Quality",
    sourceUri: "https://www.who.int/publications/i/item/9789241549950",
    appliesTo: ["total_coliform"],
    text: "Total coliform bacteria should not be detectable in treated drinking water; E. coli indicates recent fecal contamination and requires immediate investigation, resampling, and consideration of a boil-water advisory by the responsible authority. Detections from expired or improperly stored test kits carry elevated uncertainty and must be confirmed.",
    tags: ["coliform", "ecoli", "boil-water", "confirm", "uncertainty"],
  },
  {
    id: "guidance-turbidity",
    title: "Turbidity after distribution disturbances",
    sourceName: "WHO — Guidelines for Drinking-water Quality",
    sourceUri: "https://www.who.int/publications/i/item/9789241549950",
    appliesTo: ["turbidity"],
    text: "Turbidity should ideally be below 1 NTU and not exceed 5 NTU; elevated turbidity can shield pathogens from disinfection. Following pipe repairs or main breaks, distribution lines should be flushed and re-tested, and confirmatory microbiological sampling is recommended before clearing a site.",
    tags: ["turbidity", "pipe-repair", "flush", "confirm"],
  },
  {
    id: "guidance-ph",
    title: "pH operational range",
    sourceName: "WHO — Guidelines for Drinking-water Quality",
    sourceUri: "https://www.who.int/publications/i/item/9789241549950",
    appliesTo: ["ph"],
    text: "A pH in the range 6.5 to 8.5 is generally recommended for drinking water; values outside this range can impair disinfection effectiveness and increase pipe corrosion and metal leaching.",
    tags: ["ph", "corrosion", "disinfection"],
  },
  {
    id: "guidance-arsenic",
    title: "Arsenic in drinking water (reference value 0.01 mg/L)",
    sourceName: "WHO — Arsenic Fact Sheet",
    sourceUri: "https://www.who.int/news-room/fact-sheets/detail/arsenic",
    appliesTo: ["arsenic"],
    text: "The provisional guideline value for arsenic is 0.01 mg/L. Chronic exposure is associated with skin lesions and cancers. Exceedances warrant urgent confirmatory testing and identification of alternative water sources for affected populations.",
    tags: ["arsenic", "chronic", "urgent", "confirm"],
  },
  {
    id: "guidance-chlorine",
    title: "Free chlorine residual maintenance",
    sourceName: "WHO — Guidelines for Drinking-water Quality",
    sourceUri: "https://www.who.int/publications/i/item/9789241549950",
    appliesTo: ["free_chlorine"],
    text: "A free chlorine residual of at least 0.2 mg/L at the point of delivery is commonly recommended to limit microbial regrowth in the distribution network. Low residuals can indicate contamination ingress or excessive demand and warrant investigation.",
    tags: ["chlorine", "residual", "regrowth"],
  },
  {
    id: "guidance-confirmatory-sampling",
    title: "Confirmatory laboratory sampling for field-kit exceedances",
    sourceName: "Neelu synthetic operations handbook",
    sourceUri: "https://developers.databricks.com",
    appliesTo: "all",
    text: "Field test kits are a screening tool. Any exceedance detected by a field kit should be confirmed with an accredited laboratory sample collected following chain-of-custody procedures before issuing public-health notices or compliance determinations.",
    tags: ["confirm", "lab", "chain-of-custody", "process"],
  },
  {
    id: "guidance-public-notice",
    title: "Public notification responsibilities",
    sourceName: "Neelu synthetic operations handbook",
    sourceUri: "https://developers.databricks.com",
    appliesTo: "all",
    text: "Public notifications must be issued by an authorized public-health or water-system authority. Draft notices generated for review do not constitute official notification and require human and regulatory approval before any release.",
    tags: ["notice", "approval", "human-in-the-loop", "process"],
  },
];

export function guidanceById(id: string): GuidanceDoc | undefined {
  return GUIDANCE_DOCS.find((doc) => doc.id === id);
}
