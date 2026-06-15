/**
 * Public-health notice DRAFT builder. Notices are derived deterministically from
 * the case so there is no separate table. They are always labeled DRAFT, never
 * sent, and always state that final language requires human/regulatory approval.
 */

import type { Case, NoticeDraft, WaterSystem } from "../../shared/types";
import { SEVERITY_LABELS } from "../../shared/constants";

export function buildNotices(theCase: Case, system: WaterSystem): NoticeDraft[] {
  // Only meaningful once a case has been classified.
  if (!theCase.contaminant) return [];

  const severityLabel = theCase.severity
    ? SEVERITY_LABELS[theCase.severity]
    : "Under review";
  const contaminant = theCase.contaminant;

  const english: NoticeDraft = {
    language: "en",
    title: `DRAFT — Water quality advisory for ${system.name}`,
    body: [
      "[DRAFT — NOT FOR RELEASE]",
      "",
      `A field screening test at ${system.name} indicated a potential concern related to ${contaminant} (assessed severity: ${severityLabel}).`,
      "This result is provisional and is being confirmed with an accredited laboratory sample. Residents and facility staff may wish to follow precautionary guidance from local health authorities while confirmation is pending.",
      "",
      "This draft is advisory only. It is not an official notification, does not certify legal compliance, and must be reviewed and approved by an authorized public-health/regulatory official before any release.",
    ].join("\n"),
  };

  const hindi: NoticeDraft = {
    language: "hi",
    title: `मसौदा — ${system.name} के लिए जल गुणवत्ता परामर्श`,
    body: [
      "[मसौदा — जारी करने के लिए नहीं]",
      "",
      `${system.name} पर किए गए फ़ील्ड परीक्षण में ${contaminant} से संबंधित संभावित चिंता का संकेत मिला है (आकलित गंभीरता: ${severityLabel})।`,
      "यह परिणाम अनंतिम है और इसकी पुष्टि मान्यता प्राप्त प्रयोगशाला नमूने से की जा रही है। पुष्टि लंबित रहने तक निवासी स्थानीय स्वास्थ्य अधिकारियों के एहतियाती मार्गदर्शन का पालन कर सकते हैं।",
      "",
      "यह मसौदा केवल सलाहकारी है। यह आधिकारिक अधिसूचना नहीं है, किसी कानूनी अनुपालन को प्रमाणित नहीं करता, और जारी करने से पहले किसी अधिकृत सार्वजनिक-स्वास्थ्य/नियामक अधिकारी द्वारा समीक्षा एवं अनुमोदन आवश्यक है।",
    ].join("\n"),
  };

  return [english, hindi];
}
