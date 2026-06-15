import { useEffect, useMemo, useState } from "react"

export type LanguageCode = "en" | "ta" | "te" | "kn" | "ml" | "hi" | "gu" | "bn"

export const LANGUAGES: Array<{ code: LanguageCode; label: string }> = [
  { code: "en", label: "English" },
  { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" },
  { code: "kn", label: "ಕನ್ನಡ" },
  { code: "ml", label: "മലയാളം" },
  { code: "hi", label: "हिन्दी" },
  { code: "gu", label: "ગુજરાતી" },
  { code: "bn", label: "বাংলা" },
]

const STRINGS = {
  en: {
    provider: "Healthcare Provider",
    citizen: "Citizen Portal",
    contractor: "Field Contractor",
    roleGate: "Choose workspace",
    providerHint: "Desktop cockpit for evidence review, wells, facilities, and contractor operations.",
    citizenHint: "Mobile water-point reporting with voice intake and QR scan support.",
    contractorHint: "Mobile work orders, completion capture, and offline sync.",
    language: "Language",
    shortcuts: "Keyboard shortcuts",
  },
  ta: {
    provider: "சுகாதார வழங்குநர்",
    citizen: "குடிமக்கள் போர்டல்",
    contractor: "கள ஒப்பந்ததாரர்",
    roleGate: "பணிமனை தேர்வு",
    providerHint: "ஆதாரம், கிணறுகள், வசதிகள், ஒப்பந்த பணிக்கான டெஸ்க்டாப் கட்டுப்பாடு.",
    citizenHint: "குரல் மற்றும் QR ஆதரவுடன் மொபைல் நீர் புகார்.",
    contractorHint: "மொபைல் பணிகள், நிறைவு பதிவு, ஆஃப்லைன் ஒத்திசைவு.",
    language: "மொழி",
    shortcuts: "விசைப்பலகை குறுக்கு வழிகள்",
  },
  te: {
    provider: "ఆరోగ్య సేవాదారు",
    citizen: "పౌర పోర్టల్",
    contractor: "ఫీల్డ్ కాంట్రాక్టర్",
    roleGate: "పని స్థలం ఎంచుకోండి",
    providerHint: "సాక్ష్యం, బావులు, సదుపాయాలు, పనుల కోసం డెస్క్‌టాప్ కాక్‌పిట్.",
    citizenHint: "వాయిస్ మరియు QR సహాయంతో మొబైల్ నీటి రిపోర్టింగ్.",
    contractorHint: "మొబైల్ పనులు, పూర్తి నమోదు, ఆఫ్‌లైన్ సింక్.",
    language: "భాష",
    shortcuts: "కీబోర్డ్ షార్ట్‌కట్‌లు",
  },
  kn: {
    provider: "ಆರೋಗ್ಯ ಪೂರೈಕೆದಾರ",
    citizen: "ನಾಗರಿಕ ಪೋರ್ಟಲ್",
    contractor: "ಕ್ಷೇತ್ರ ಗುತ್ತಿಗೆದಾರ",
    roleGate: "ಕಾರ್ಯಸ್ಥಳ ಆಯ್ಕೆ",
    providerHint: "ಸಾಕ್ಷ್ಯ, ಬಾವಿ, ಸೌಲಭ್ಯ, ಕೆಲಸಗಳ ಡೆಸ್ಕ್‌ಟಾಪ್ ನಿಯಂತ್ರಣ.",
    citizenHint: "ಧ್ವನಿ ಮತ್ತು QR ಬೆಂಬಲದ ಮೊಬೈಲ್ ನೀರು ವರದಿ.",
    contractorHint: "ಮೊಬೈಲ್ ಕೆಲಸಗಳು, ಪೂರ್ಣಗೊಳಿಸುವಿಕೆ, ಆಫ್‌ಲೈನ್ ಸಿಂಕ್.",
    language: "ಭಾಷೆ",
    shortcuts: "ಕೀಬೋರ್ಡ್ ಶಾರ್ಟ್‌ಕಟ್‌ಗಳು",
  },
  ml: {
    provider: "ആരോഗ്യ സേവനദാതാവ്",
    citizen: "പൗര പോർട്ടൽ",
    contractor: "ഫീൽഡ് കരാറുകാരൻ",
    roleGate: "പ്രവർത്തനസ്ഥലം തിരഞ്ഞെടുക്കുക",
    providerHint: "തെളിവ്, കിണറുകൾ, സൗകര്യങ്ങൾ, ജോലികൾക്കുള്ള ഡെസ്‌ക്‌ടോപ്പ് നിയന്ത്രണം.",
    citizenHint: "വോയ്സ്, QR പിന്തുണയുള്ള മൊബൈൽ ജല റിപ്പോർട്ട്.",
    contractorHint: "മൊബൈൽ ജോലികൾ, പൂർത്തിയാക്കൽ രേഖ, ഓഫ്‌ലൈൻ സിങ്ക്.",
    language: "ഭാഷ",
    shortcuts: "കീബോർഡ് കുറുക്കുവഴികൾ",
  },
  hi: {
    provider: "स्वास्थ्य सेवा प्रदाता",
    citizen: "नागरिक पोर्टल",
    contractor: "फील्ड कॉन्ट्रैक्टर",
    roleGate: "कार्यस्थल चुनें",
    providerHint: "साक्ष्य, कुओं, सुविधाओं और कार्य आदेशों के लिए डेस्कटॉप कॉकपिट.",
    citizenHint: "वॉयस और QR सहायता वाला मोबाइल जल रिपोर्टिंग.",
    contractorHint: "मोबाइल कार्य, पूर्णता कैप्चर और ऑफलाइन सिंक.",
    language: "भाषा",
    shortcuts: "कीबोर्ड शॉर्टकट",
  },
  gu: {
    provider: "હેલ્થકેર પ્રદાતા",
    citizen: "નાગરિક પોર્ટલ",
    contractor: "ફિલ્ડ કોન્ટ્રાક્ટર",
    roleGate: "વર્કસ્પેસ પસંદ કરો",
    providerHint: "પુરાવા, કૂવા, સુવિધાઓ અને કામો માટે ડેસ્કટોપ કોકપિટ.",
    citizenHint: "વૉઇસ અને QR આધાર સાથે મોબાઇલ પાણી રિપોર્ટિંગ.",
    contractorHint: "મોબાઇલ કામો, પૂર્ણતા નોંધ અને ઑફલાઇન સિંક.",
    language: "ભાષા",
    shortcuts: "કીબોર્ડ શૉર્ટકટ્સ",
  },
  bn: {
    provider: "স্বাস্থ্যসেবা প্রদানকারী",
    citizen: "নাগরিক পোর্টাল",
    contractor: "ফিল্ড কন্ট্রাক্টর",
    roleGate: "ওয়ার্কস্পেস বেছে নিন",
    providerHint: "প্রমাণ, কূপ, সুবিধা এবং কাজের জন্য ডেস্কটপ ককপিট.",
    citizenHint: "ভয়েস ও QR সহায়তায় মোবাইল জল রিপোর্টিং.",
    contractorHint: "মোবাইল কাজ, সম্পন্নতার রেকর্ড এবং অফলাইন সিঙ্ক.",
    language: "ভাষা",
    shortcuts: "কীবোর্ড শর্টকাট",
  },
} satisfies Record<LanguageCode, Record<string, string>>

const STORAGE_KEY = "neelu-language"

function isLanguage(value: string | null): value is LanguageCode {
  return LANGUAGES.some((language) => language.code === value)
}

export function useLanguage() {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isLanguage(stored) ? stored : "en"
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language)
  }, [language])

  return useMemo(
    () => ({
      language,
      setLanguage: setLanguageState,
      t: STRINGS[language],
    }),
    [language]
  )
}
