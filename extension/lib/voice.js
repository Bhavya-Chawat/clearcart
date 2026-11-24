// VOICE GUARDIAN – speech recognition, intent parser (EN / Hinglish / Devanagari), TTS with ElevenLabs → speechSynthesis fallback.
(function (root) {
  const INTENTS = [
    ['button', /(which|real|asli|sahi)\s*(wala\s*)?button|button\s*(kaun|asli)|असली\s*बटन|कौन\s*सा\s*बटन|बटन/i],
    ['complaint', /(complain|complaint|shikayat|shikaayat|शिकायत|report)/i],
    ['remove', /(remove|extras?|hatao|hata do|untick|हटाओ|हटा\s*दो)/i],
    ['clean', /(clean|saaf|saf karo|साफ)/i],
    ['cheaper', /(cheap|sasta|sasti|सस्ता|सस्ती|alternative|doosra|dusra|दूसरा|better option)/i],
    ['price', /(real price|asli (keemat|kimat|daam)|final price|total|kitna|कीमत|दाम|कितना)/i],
    ['deal', /(good deal|is this (a )?good|deal\s*(sahi|theek|accha)|sahi hai|अच्छा|सही|डील|safe)/i]
  ];
  function parseIntent(text) {
    const t = (text || '').toLowerCase();
    for (const [name, rx] of INTENTS) if (rx.test(t)) return name;
    return 'unknown';
  }

  const NUM_HI = ['शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस'];
  const T = {
    en: {
      deal: (d) => `This page uses ${d.n} trick${d.n === 1 ? '' : 's'}${d.top ? ', like ' + d.top : ''}. ${d.total ? `The real price is ${d.total} rupees, not ${d.listed}.` : ''} ${d.alt ? `${d.alt.name} is ${d.alt.cheaperBy} rupees cheaper, with no tricks.` : ''}`,
      price: (d) => d.total ? `Shown price ${d.listed} rupees. Real total ${d.total} rupees. That is ${d.diff} rupees of hidden fees.` : `I could not find the final price on this site.`,
      remove: (d) => d.amount ? `I removed extras worth ${d.amount} rupees that you did not choose.` : `There were no extra add-ons to remove.`,
      button: (d) => d.real ? `The green button is the real one. The other ${d.fake} are ads.` : `I could not find a real download button here.`,
      clean: (d) => d.on ? 'Clean view is on. I hid the fake timers and popups.' : 'Clean view is off.',
      cheaper: (d) => d.alt ? `${d.alt.name} costs ${d.alt.total} rupees all-inclusive. That is ${d.alt.cheaperBy} rupees cheaper, with no tricks.` : `I did not find a cheaper honest option.`,
      complaint: () => 'I opened the complaint form and filled it for you. Please check it and press submit yourself.',
      unknown: () => 'Sorry, I did not understand. Try: is this a good deal, real price, remove extras, which button is real.'
    },
    hi: {
      deal: (d) => `इस पेज पर ${d.n} चालें हैं। ${d.total ? `असली कीमत ${d.total} रुपये है, ${d.listed} नहीं।` : ''} ${d.alt ? `${d.alt.name} पर ${d.alt.cheaperBy} रुपये सस्ता है, बिना किसी चाल के।` : ''}`,
      price: (d) => d.total ? `दिखाई गई कीमत ${d.listed} रुपये। असली कुल कीमत ${d.total} रुपये। यानी ${d.diff} रुपये छुपे हुए शुल्क।` : 'इस साइट पर अंतिम कीमत नहीं मिली।',
      remove: (d) => d.amount ? `मैंने ${d.amount} रुपये की वो चीज़ें हटा दीं जो आपने नहीं चुनी थीं।` : 'हटाने के लिए कोई अतिरिक्त चीज़ नहीं थी।',
      button: (d) => d.real ? `हरा वाला बटन असली है, बाकी ${NUM_HI[d.fake] || d.fake} विज्ञापन हैं।` : 'यहाँ असली डाउनलोड बटन नहीं मिला।',
      clean: (d) => d.on ? 'साफ़ व्यू चालू है। नकली टाइमर और पॉपअप छुपा दिए।' : 'साफ़ व्यू बंद है।',
      cheaper: (d) => d.alt ? `${d.alt.name} पर कुल ${d.alt.total} रुपये, यानी ${d.alt.cheaperBy} रुपये सस्ता, बिना किसी चाल के।` : 'कोई सस्ता ईमानदार विकल्प नहीं मिला।',
      complaint: () => 'मैंने शिकायत फ़ॉर्म भर दिया है। कृपया जाँच कर खुद सबमिट करें।',
      unknown: () => 'माफ़ कीजिए, समझ नहीं आया। बोलिए: यह डील सही है? असली कीमत? एक्स्ट्रा हटाओ? असली बटन कौन सा है?'
    }
  };

  let audio = null;
  async function speak(text, lang, settings = {}) {
    if (!text) return 'none';
    const loud = settings.seniorMode ? 1 : 0.9;
    // 1) backend proxy (key stays server-side)
    if (settings.backendUrl) {
      try {
        const r = await fetch(settings.backendUrl.replace(/\/$/, '') + '/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }) });
        if (r.ok) return play(await r.blob(), loud, 'backend');
      } catch (e) { /* fall through */ }
    }
    // 2) direct ElevenLabs with key from options
    if (settings.elevenKey && settings.voiceId) {
      try {
        const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(settings.voiceId)}`, {
          method: 'POST', headers: { 'xi-api-key': settings.elevenKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' })
        });
        if (r.ok) return play(await r.blob(), loud, 'elevenlabs');
      } catch (e) { /* fall through */ }
    }
    // 3) browser speech synthesis
    return new Promise((resolve) => {
      if (!('speechSynthesis' in root)) return resolve('none');
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
      const v = speechSynthesis.getVoices().find((x) => x.lang === u.lang) || speechSynthesis.getVoices().find((x) => x.lang.startsWith(lang));
      if (v) u.voice = v;
      u.rate = settings.seniorMode ? 0.85 : 0.95; u.volume = loud;
      u.onend = u.onerror = () => resolve('speechSynthesis');
      speechSynthesis.speak(u);
    });
  }
  function play(blob, vol, via) {
    if (audio) audio.pause();
    audio = new Audio(URL.createObjectURL(blob)); audio.volume = vol;
    return audio.play().then(() => via).catch(() => 'blocked');
  }

  function listen(lang) {
    return new Promise((resolve, reject) => {
      const SR = root.webkitSpeechRecognition || root.SpeechRecognition;
      if (!SR) return reject(new Error('Speech recognition not supported in this browser'));
      const rec = new SR();
      rec.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
      rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onresult = (e) => resolve(e.results[0][0].transcript);
      rec.onerror = (e) => reject(new Error(e.error === 'not-allowed' ? 'Microphone not allowed – open ClearCart options and click "Allow microphone" once.' : e.error));
      rec.onend = () => resolve('');
      rec.start();
    });
  }

  root.CCVoice = { parseIntent, speak, listen, T };
})(typeof self !== 'undefined' ? self : window);
