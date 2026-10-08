const SPEECH_LANGUAGES = [
  { code: 'en-IN', name: 'English (India)', nativeName: 'English' },
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'bn-IN', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'te-IN', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'mr-IN', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'gu-IN', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'kn-IN', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ml-IN', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'pa-IN', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'or-IN', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
  { code: 'ur-IN', name: 'Urdu', nativeName: 'اردو' },
  { code: 'as-IN', name: 'Assamese', nativeName: 'অসমীয়া' },
  { code: 'en-US', name: 'English (US)', nativeName: 'English' },
  { code: 'es-ES', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr-FR', name: 'French', nativeName: 'Français' },
  { code: 'de-DE', name: 'German', nativeName: 'Deutsch' },
];

function parseSpeechLanguage(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 16) return null;
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(value)) return null;
  return value;
}

function languageReplyInstruction(code) {
  if (!code) return '';
  const lang = SPEECH_LANGUAGES.find((item) => item.code === code);
  const label = lang ? `${lang.name} (${lang.nativeName}, BCP-47 ${lang.code})` : `BCP-47 ${code}`;
  return `Reply entirely in ${label}. Keep product names such as Finlytix in Latin script. Do not mix in another language except for product names, UI labels, and unavoidable technical terms.`;
}

const HELP_GREETINGS = {
  hello: true,
  hi: true,
  hey: true,
  హలో: true,
  హాలో: true,
  హెల్లో: true,
  నమస్కారం: true,
  नमस्ते: true,
  ನಮಸ್ಕಾರ: true,
};

const HELP_HELLO = {
  'en-IN':
    'Hello! Ask how Finlytix works, including uploads, privacy, settings, and what is still planned.',
  'en-US':
    'Hello! Ask how Finlytix works, including uploads, privacy, settings, and what is still planned.',
  'hi-IN':
    'नमस्ते! पूछें कि Finlytix कैसे काम करता है — अपलोड, गोपनीयता, सेटिंग्स, और क्या योजना में है।',
  'bn-IN':
    'নমস্কার! জিজ্ঞাসা করুন Finlytix কীভাবে কাজ করে — আপলোড, গোপনীয়তা, সেটিংস, এবং কী পরিকল্পিত।',
  'te-IN':
    'హలో! Finlytix ఎలా పనిచేస్తుందో అడగండి — అప్‌లోడ్‌లు, గోప్యత, సెట్టింగ్‌లు, ఇంకా ఏమి ప్లాన్‌లో ఉంది.',
  'mr-IN':
    'नमस्कार! Finlytix कसे काम करते ते विचारा — अपलोड, गोपनीयता, सेटिंग्ज आणि काय नियोजित आहे.',
  'ta-IN':
    'வணக்கம்! Finlytix எப்படி வேலை செய்கிறது என்று கேளுங்கள் — பதிவேற்றங்கள், தனியுரிமை, அமைப்புகள்.',
  'gu-IN': 'નમસ્તે! પૂછો કે Finlytix કેવી રીતે કામ કરે છે — અપલોડ, ગોપનીયતા, સેટિંગ્સ.',
  'kn-IN': 'ನಮಸ್ಕಾರ! Finlytix ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ ಎಂದು ಕೇಳಿ — ಅಪ್‌ಲೋಡ್, ಗೌಪ್ಯತೆ, ಸೆಟ್ಟಿಂಗ್‌ಗಳು.',
  'ml-IN':
    'നമസ്കാരം! Finlytix എങ്ങനെ പ്രവർത്തിക്കുന്നു എന്ന് ചോദിക്കൂ — അപ്‌ലോഡുകൾ, സ്വകാര്യത, ക്രമീകരണങ്ങൾ.',
  'pa-IN': 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਪੁੱਛੋ Finlytix ਕਿਵੇਂ ਕੰਮ ਕਰਦਾ ਹੈ — ਅੱਪਲੋਡ, ਪਰਦੇਦਾਰੀ, ਸੈਟਿੰਗਾਂ.',
  'or-IN': 'ନମସ୍କାର! Finlytix କିପରି କାମ କରେ ପଚାରନ୍ତୁ — ଅପଲୋଡ୍, ଗୋପନୀୟତା, ସେଟିଂସ୍।',
  'ur-IN': 'السلام علیکم! پوچھیں Finlytix کیسے کام کرتا ہے — اپ لوڈ، رازداری، سیٹنگز۔',
  'as-IN': 'নমস্কাৰ! সুধিব Finlytix কেনেকৈ কাম কৰে — আপলোড, গোপনীয়তা, ছেটিংছ।',
  'es-ES': 'Hola. Pregunta cómo funciona Finlytix, incluidas cargas, privacidad y ajustes.',
  'fr-FR':
    'Bonjour. Demandez comment Finlytix fonctionne, y compris les importations, la confidentialité et les paramètres.',
  'de-DE':
    'Hallo. Fragen Sie, wie Finlytix funktioniert, einschließlich Uploads, Datenschutz und Einstellungen.',
};

function helpGreeting(message, language) {
  const greeting = message
    .trim()
    .toLocaleLowerCase()
    .replace(/[!?.।॥।]+$/u, '')
    .replace(/[!?.。]+$/u, '')
    .trim();
  if (!Object.hasOwn(HELP_GREETINGS, greeting)) return null;
  return HELP_HELLO[language] || HELP_HELLO['en-IN'];
}

module.exports = {
  SPEECH_LANGUAGES,
  parseSpeechLanguage,
  languageReplyInstruction,
  helpGreeting,
};
