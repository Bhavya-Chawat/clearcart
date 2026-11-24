// CCPA "Guidelines for Prevention and Regulation of Dark Patterns, 2023" – 13 specified patterns.
// weight = points removed from the Trust Score per finding; severity drives colour + auto-speak.
(function (root) {
  const PATTERNS = {
    false_urgency: { name: 'False Urgency', weight: 12, severity: 'medium',
      en: 'Creates a false sense of urgency or scarcity (fake timers, "only 1 left", "14 people viewing") to rush you.',
      hi: 'झूठी जल्दबाज़ी: नकली टाइमर या "सिर्फ़ 1 बचा है" जैसे दावे आपको जल्दी खरीदने के लिए दबाव डालते हैं।' },
    basket_sneaking: { name: 'Basket Sneaking', weight: 15, severity: 'high',
      en: 'Adds a paid item (insurance, warranty, donation) to your cart without you choosing it.',
      hi: 'बास्केट स्नीकिंग: बिना पूछे आपकी कार्ट में पैसे वाली चीज़ (बीमा, वारंटी) जोड़ दी गई है।' },
    confirm_shaming: { name: 'Confirm Shaming', weight: 8, severity: 'medium',
      en: 'Uses guilt or shame to make you accept ("No thanks, I like taking risks").',
      hi: 'कन्फ़र्म शेमिंग: मना करने पर आपको शर्मिंदा या डराने वाली भाषा का इस्तेमाल।' },
    forced_action: { name: 'Forced Action', weight: 10, severity: 'medium',
      en: 'Forces you to do something unrelated (sign up, share contacts) to get what you came for.',
      hi: 'ज़बरदस्ती: जो चाहिए उसके लिए कोई और काम करवाना।' },
    subscription_trap: { name: 'Subscription Trap', weight: 12, severity: 'high',
      en: 'Makes cancelling hard or hides auto-renewal.',
      hi: 'सब्सक्रिप्शन जाल: रद्द करना मुश्किल या ऑटो-रिन्यूअल छुपाया गया।' },
    interface_interference: { name: 'Interface Interference', weight: 8, severity: 'medium',
      en: 'Design makes the option the site wants big and bright, and your option tiny or hidden.',
      hi: 'इंटरफ़ेस हस्तक्षेप: कंपनी वाला बटन बड़ा और चमकीला, आपका विकल्प छोटा और छुपा हुआ।' },
    bait_and_switch: { name: 'Bait and Switch', weight: 12, severity: 'high',
      en: 'Advertises one outcome but delivers another.',
      hi: 'बेट एंड स्विच: दिखाया कुछ और, दिया कुछ और।' },
    drip_pricing: { name: 'Drip Pricing', weight: 12, severity: 'high',
      en: 'Extra fees appear only at checkout, so the real price is higher than shown.',
      hi: 'ड्रिप प्राइसिंग: चेकआउट पर अचानक अतिरिक्त शुल्क जोड़े गए, असली कीमत ज़्यादा है।' },
    disguised_advertisement: { name: 'Disguised Advertisement', weight: 8, severity: 'medium',
      en: 'An ad is made to look like normal content or a real button.',
      hi: 'छुपा विज्ञापन: विज्ञापन को असली नतीजे या असली बटन जैसा दिखाया गया है।' },
    nagging: { name: 'Nagging', weight: 6, severity: 'low',
      en: 'Keeps interrupting you with the same request (install app, notifications).',
      hi: 'नैगिंग: बार-बार वही पॉपअप (ऐप डाउनलोड करें) दिखाकर परेशान करना।' },
    trick_question: { name: 'Trick Question', weight: 10, severity: 'medium',
      en: 'Confusing wording (double negatives) to make you agree by mistake.',
      hi: 'ट्रिक प्रश्न: उलझी भाषा (दोहरा नकार) ताकि आप गलती से हाँ कर दें।' },
    saas_billing: { name: 'SaaS Billing', weight: 10, severity: 'medium',
      en: 'Silently charges recurring fees, e.g. after a free trial.',
      hi: 'SaaS बिलिंग: चुपचाप बार-बार पैसे काटना।' },
    rogue_malpractices: { name: 'Rogue Malpractices', weight: 20, severity: 'high',
      en: 'Scams such as fake virus alerts, fake buttons or fake close buttons that trick you into clicking.',
      hi: 'धोखाधड़ी: नकली वायरस अलर्ट, नकली बटन या नकली बंद करने वाला X।' }
  };
  root.CC_PATTERNS = PATTERNS;
  root.ccBadgeFor = function (score) { return score >= 75 ? 'green' : score >= 45 ? 'amber' : 'red'; };
})(typeof self !== 'undefined' ? self : window);
