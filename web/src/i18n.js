// Small translation layer: English, Hindi and Arabic (right-to-left). Missing keys fall back to English.
import { useApp } from './store.jsx';

const en = {
  home: 'Home', rank: 'Rank', chats: 'Chats', me: 'Me',
  popular: 'Popular', new: 'New', following: 'Following', party: 'Party Rooms',
  all: 'All', nearMe: 'My country', myLang: 'My language', searchPh: 'Search by name or ID',
  noLive: 'No one is live yet. Be the first!', noFollowLive: 'Nobody you follow is live right now',
  cat_talk: 'Talk', cat_music: 'Music', cat_bhakti: 'Bhakti', cat_shayari: 'Shayari', cat_comedy: 'Comedy', cat_astrology: 'Astrology',
  cat_study: 'Study', cat_dance: 'Dance', cat_cooking: 'Cooking', cat_fitness: 'Fitness', cat_games: 'Games',
  verified: 'Verified', live: 'LIVE', partyTag: 'PARTY',
  // gifts
  send: 'Send', recharge: 'Recharge', local: 'Local', sendTo: 'Send to', fullScreen: 'Full screen', global: 'Global',
  confirmTitle: 'Confirm gift', confirmBody: 'You are about to send {coins} coins (about {money}).', confirmYes: 'Yes, send', cancel: 'Cancel',
  notEnough: 'Not enough coins', dailyLimitHit: 'This gift would cross your daily limit. You can change it in Safety settings.',
  // room
  sayHi: 'Say hi…', saySomething: 'Say something nice…', topFans: 'Top fans', viewers: 'Viewers', more: 'More', report: 'Report this live',
  effectsOff: 'Turn off gift effects', effectsOn: 'Turn on gift effects', translateOn: 'Translate chat to my language', translateOff: 'Show chat as written',
  audioOnly: 'Audio only (saves data)', videoBack: 'Turn video back on', welcomeRules: 'Welcome! Be respectful. Nudity, abuse and sharing phone numbers lead to a ban.',
  translated: 'translated', liveCheck: 'Live check', liveCheckBtn: "I'm live ✋", liveCheckNote: 'Tap within {s} seconds to keep your live running.',
  reportWhy: 'Why are you reporting?', thanksReport: 'Thanks, our team will review this',
  // me & settings
  safety: 'Safety & spending', verifyId: 'Verify identity', editProfile: 'Edit profile', logout: 'Logout', store: 'Store: entry effects, frames, bubbles',
  vip: 'VIP', hostCentre: 'Host centre: earnings & withdraw', becomeHost: 'Become a host', agency: 'Agency', rechargeCoins: 'Recharge coins',
  dailyLimit: 'Daily gift limit', noLimit: 'No limit', setLimit: 'Save limit', limitPending: 'New limit {n} starts {when}',
  spentToday: 'Spent on gifts today', lowData: 'Low data mode', lowDataNote: 'Smaller video and no autoplay previews. Good for 3G or a small data pack.',
  refunds: 'Accidental recharge? Get a refund', refundNote: 'Ask within {h} hours if you have not used the coins.', askRefund: 'Ask for refund',
  myReports: 'My reports', noReports: 'You have not reported anything.',
  language: 'App language', country: 'Country', save: 'Save',
  // host
  rateCard: 'How your earnings work', rate1: '1 coin of gifts = 1 diamond for you', rate2: '{d} diamonds = {money1}',
  rate3: 'Agency commission is paid by the app, it is never cut from your diamonds.', rate4: 'Minimum withdrawal: {min} diamonds',
  verifyFirst: 'Verify your identity to go live', verifyWhy: 'Only real, verified people can host. It keeps fake profiles out and protects your earnings.',
  goLive: 'Go Live', videoLive: 'Video live', partyRoom: 'Party room', category: 'Category', roomLang: 'Language of your live',
  // banned
  bannedTitle: 'Your account is suspended', bannedUntil: 'Until {date}', bannedSafe: 'Your coins and the diamonds you earned are safe. If you think this is a mistake, tell us below.',
  appealPh: 'What happened? Explain in a few lines', appealSend: 'Send appeal', appealOpen: 'Your appeal is being reviewed. We reply within 48 hours.',
  payoutFor: 'Payout details (only if you want your earnings paid out)',
};

const hi = {
  home: 'होम', rank: 'रैंक', chats: 'चैट', me: 'मैं',
  popular: 'पॉपुलर', new: 'नए', following: 'फॉलोइंग', party: 'पार्टी रूम',
  all: 'सभी', nearMe: 'मेरा देश', myLang: 'मेरी भाषा', searchPh: 'नाम या ID से खोजें',
  noLive: 'अभी कोई लाइव नहीं है। पहले आप शुरू करें!', noFollowLive: 'आप जिन्हें फॉलो करते हैं, उनमें से कोई अभी लाइव नहीं है',
  cat_talk: 'बातचीत', cat_music: 'संगीत', cat_bhakti: 'भक्ति', cat_shayari: 'शायरी', cat_comedy: 'कॉमेडी', cat_astrology: 'ज्योतिष',
  cat_study: 'पढ़ाई', cat_dance: 'डांस', cat_cooking: 'कुकिंग', cat_fitness: 'फिटनेस', cat_games: 'गेम्स',
  verified: 'वेरिफ़ाइड', live: 'लाइव', partyTag: 'पार्टी',
  send: 'भेजें', recharge: 'रिचार्ज', local: 'मेरे देश के', sendTo: 'किसे भेजें', fullScreen: 'फुल स्क्रीन', global: 'ग्लोबल',
  confirmTitle: 'गिफ्ट कन्फर्म करें', confirmBody: 'आप {coins} कॉइन (लगभग {money}) का गिफ्ट भेज रहे हैं।', confirmYes: 'हाँ, भेजें', cancel: 'रद्द करें',
  notEnough: 'कॉइन कम हैं', dailyLimitHit: 'यह गिफ्ट आपकी रोज़ की सीमा से ज़्यादा हो जाएगा। सीमा सुरक्षा सेटिंग में बदल सकते हैं।',
  sayHi: 'कुछ कहें…', saySomething: 'कुछ अच्छा लिखें…', topFans: 'टॉप फैन', viewers: 'दर्शक', more: 'और', report: 'इस लाइव की शिकायत करें',
  effectsOff: 'गिफ्ट इफ़ेक्ट बंद करें', effectsOn: 'गिफ्ट इफ़ेक्ट चालू करें', translateOn: 'चैट मेरी भाषा में अनुवाद करें', translateOff: 'चैट जैसी लिखी है वैसी दिखाएँ',
  audioOnly: 'सिर्फ़ आवाज़ (डेटा बचाएँ)', videoBack: 'वीडियो फिर से चालू करें', welcomeRules: 'स्वागत है! सम्मान से बात करें। अश्लीलता, गाली या फ़ोन नंबर शेयर करने पर बैन होगा।',
  translated: 'अनुवाद', liveCheck: 'लाइव चेक', liveCheckBtn: 'मैं लाइव हूँ ✋', liveCheckNote: 'लाइव चालू रखने के लिए {s} सेकंड में टैप करें।',
  reportWhy: 'शिकायत की वजह?', thanksReport: 'धन्यवाद, हमारी टीम इसे देखेगी',
  safety: 'सुरक्षा और ख़र्च', verifyId: 'पहचान वेरिफ़ाई करें', editProfile: 'प्रोफ़ाइल बदलें', logout: 'लॉगआउट', store: 'स्टोर: एंट्री इफ़ेक्ट, फ्रेम, बबल',
  vip: 'VIP', hostCentre: 'होस्ट सेंटर: कमाई और विदड्रॉ', becomeHost: 'होस्ट बनें', agency: 'एजेंसी', rechargeCoins: 'कॉइन रिचार्ज करें',
  dailyLimit: 'रोज़ की गिफ्ट सीमा', noLimit: 'कोई सीमा नहीं', setLimit: 'सीमा सेव करें', limitPending: 'नई सीमा {n} {when} से लागू होगी',
  spentToday: 'आज गिफ्ट पर ख़र्च', lowData: 'कम डेटा मोड', lowDataNote: 'छोटा वीडियो और बिना ऑटो-प्ले। 3G या छोटे डेटा पैक के लिए अच्छा।',
  refunds: 'ग़लती से रिचार्ज हुआ? रिफ़ंड लें', refundNote: '{h} घंटे के अंदर माँगें, अगर कॉइन इस्तेमाल नहीं हुए हैं।', askRefund: 'रिफ़ंड माँगें',
  myReports: 'मेरी शिकायतें', noReports: 'आपने कोई शिकायत नहीं की है।',
  language: 'ऐप की भाषा', country: 'देश', save: 'सेव करें',
  rateCard: 'आपकी कमाई का हिसाब', rate1: 'गिफ्ट का 1 कॉइन = आपके लिए 1 डायमंड', rate2: '{d} डायमंड = {money1}',
  rate3: 'एजेंसी का कमीशन ऐप देता है, आपके डायमंड से कभी नहीं कटता।', rate4: 'कम से कम विदड्रॉ: {min} डायमंड',
  verifyFirst: 'लाइव जाने के लिए पहचान वेरिफ़ाई करें', verifyWhy: 'सिर्फ़ असली, वेरिफ़ाइड लोग होस्ट बन सकते हैं। इससे फ़र्ज़ी प्रोफ़ाइल दूर रहती हैं और आपकी कमाई सुरक्षित रहती है।',
  goLive: 'लाइव जाएँ', videoLive: 'वीडियो लाइव', partyRoom: 'पार्टी रूम', category: 'कैटेगरी', roomLang: 'लाइव की भाषा',
  bannedTitle: 'आपका अकाउंट निलंबित है', bannedUntil: '{date} तक', bannedSafe: 'आपके कॉइन और कमाए हुए डायमंड सुरक्षित हैं। अगर आपको लगता है कि ग़लती हुई है, नीचे बताएँ।',
  appealPh: 'क्या हुआ? कुछ लाइनों में बताएँ', appealSend: 'अपील भेजें', appealOpen: 'आपकी अपील देखी जा रही है। 48 घंटे में जवाब मिलेगा।',
  payoutFor: 'पेमेंट की जानकारी (सिर्फ़ अगर आप अपनी कमाई निकालना चाहते हैं)',
};

const ar = {
  home: 'الرئيسية', rank: 'الترتيب', chats: 'الدردشات', me: 'أنا',
  popular: 'الأكثر شعبية', new: 'جديد', following: 'المتابَعون', party: 'غرف الحفلات',
  all: 'الكل', nearMe: 'بلدي', myLang: 'لغتي', searchPh: 'ابحث بالاسم أو المعرّف',
  noLive: 'لا يوجد بث مباشر الآن. كن الأول!', noFollowLive: 'لا أحد ممن تتابعهم في بث مباشر الآن',
  cat_talk: 'دردشة', cat_music: 'موسيقى', cat_bhakti: 'روحانيات', cat_shayari: 'شعر', cat_comedy: 'كوميديا', cat_astrology: 'أبراج',
  cat_study: 'دراسة', cat_dance: 'رقص', cat_cooking: 'طبخ', cat_fitness: 'لياقة', cat_games: 'ألعاب',
  verified: 'موثّق', live: 'مباشر', partyTag: 'حفلة',
  send: 'إرسال', recharge: 'شحن', local: 'محلي', sendTo: 'أرسل إلى', fullScreen: 'ملء الشاشة', global: 'عالمي',
  confirmTitle: 'تأكيد الهدية', confirmBody: 'ستُرسل {coins} عملة (حوالي {money}).', confirmYes: 'نعم، أرسل', cancel: 'إلغاء',
  notEnough: 'العملات غير كافية', dailyLimitHit: 'هذه الهدية تتجاوز حدك اليومي. يمكنك تغييره من إعدادات الأمان.',
  sayHi: 'قل مرحباً…', saySomething: 'اكتب شيئاً لطيفاً…', topFans: 'كبار الداعمين', viewers: 'المشاهدون', more: 'المزيد', report: 'الإبلاغ عن هذا البث',
  effectsOff: 'إيقاف مؤثرات الهدايا', effectsOn: 'تشغيل مؤثرات الهدايا', translateOn: 'ترجمة الدردشة إلى لغتي', translateOff: 'عرض الدردشة كما كُتبت',
  audioOnly: 'صوت فقط (توفير البيانات)', videoBack: 'إعادة تشغيل الفيديو', welcomeRules: 'أهلاً! احترم الجميع. العُري والإساءة ومشاركة أرقام الهواتف تؤدي إلى الحظر.',
  translated: 'مترجم', liveCheck: 'تحقق من البث', liveCheckBtn: 'أنا موجود ✋', liveCheckNote: 'اضغط خلال {s} ثانية ليستمر البث.',
  reportWhy: 'لماذا تُبلغ؟', thanksReport: 'شكراً، سيراجع فريقنا ذلك',
  safety: 'الأمان والإنفاق', verifyId: 'توثيق الهوية', editProfile: 'تعديل الملف', logout: 'تسجيل الخروج', store: 'المتجر: مؤثرات الدخول، الإطارات، الفقاعات',
  vip: 'VIP', hostCentre: 'مركز المضيف: الأرباح والسحب', becomeHost: 'كن مضيفاً', agency: 'الوكالة', rechargeCoins: 'شحن العملات',
  dailyLimit: 'حد الهدايا اليومي', noLimit: 'بلا حد', setLimit: 'حفظ الحد', limitPending: 'الحد الجديد {n} يبدأ {when}',
  spentToday: 'إنفاق اليوم على الهدايا', lowData: 'وضع توفير البيانات', lowDataNote: 'فيديو أصغر وبدون تشغيل تلقائي.',
  refunds: 'شحنت بالخطأ؟ اطلب استرداداً', refundNote: 'اطلب خلال {h} ساعة إذا لم تستخدم العملات.', askRefund: 'طلب استرداد',
  myReports: 'بلاغاتي', noReports: 'لم تقم بأي بلاغ.',
  language: 'لغة التطبيق', country: 'الدولة', save: 'حفظ',
  rateCard: 'كيف تُحسب أرباحك', rate1: '1 عملة من الهدايا = 1 ماسة لك', rate2: '{d} ماسة = {money1}',
  rate3: 'عمولة الوكالة يدفعها التطبيق، ولا تُخصم أبداً من ماساتك.', rate4: 'الحد الأدنى للسحب: {min} ماسة',
  verifyFirst: 'وثّق هويتك لتبدأ البث', verifyWhy: 'فقط الأشخاص الحقيقيون الموثّقون يمكنهم الاستضافة. هذا يحمي من الحسابات المزيفة ويحمي أرباحك.',
  goLive: 'ابدأ البث', videoLive: 'بث فيديو', partyRoom: 'غرفة حفلة', category: 'الفئة', roomLang: 'لغة البث',
  bannedTitle: 'تم تعليق حسابك', bannedUntil: 'حتى {date}', bannedSafe: 'عملاتك والماسات التي ربحتها في أمان. إذا كان هذا خطأ، أخبرنا أدناه.',
  appealPh: 'ماذا حدث؟ اشرح في بضعة أسطر', appealSend: 'إرسال الاستئناف', appealOpen: 'استئنافك قيد المراجعة. سنرد خلال 48 ساعة.',
  payoutFor: 'بيانات الدفع (فقط إذا أردت سحب أرباحك)',
};

const DICTS = { en, hi, ar };
export const UI_LANGS = [['hi', 'हिन्दी'], ['en', 'English'], ['ar', 'العربية']];
export const RTL = new Set(['ar', 'ur']);

export function getLang() {
  try { return localStorage.getItem('liveapp_lang') || 'en'; } catch { return 'en'; }
}
export function setLang(l) {
  try { localStorage.setItem('liveapp_lang', l || 'en'); } catch { /* private mode */ }
  applyDir(l || 'en');
}
export function applyDir(l) {
  document.documentElement.lang = l || 'en';
  document.documentElement.dir = RTL.has(l) ? 'rtl' : 'ltr';
}

export function translateKey(lang, key, vars) {
  let s = (DICTS[lang] || en)[key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

export function useT() {
  const { lang } = useApp();
  return (key, vars) => translateKey(lang, key, vars);
}
