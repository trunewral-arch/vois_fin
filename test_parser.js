// Russian Speech Parser for Voice Expense (v4.0.8)
function parseVoiceExpense(rawText) {
  if (!rawText || !rawText.trim()) {
    return { amount: 0, description: '', raw: '' };
  }

  let text = rawText.trim().toLowerCase();

  // Preserve decimal comma between digits (e.g. "250,50" -> "250.50") before stripping punctuation
  text = text.replace(/(\d),(\d{1,2})(?=\D|$)/g, '$1.$2')
             .replace(/[,;]/g, ' ')
             .replace(/[₽]/g, ' руб ')
             .replace(/\s+/g, ' ')
             .trim();

  const NUM_WORDS = {
    'ноль': 0, 'нуль': 0,
    'один': 1, 'одна': 1, 'одну': 1,
    'два': 2, 'две': 2,
    'три': 3,
    'четыре': 4,
    'пять': 5,
    'шесть': 6,
    'семь': 7,
    'восемь': 8,
    'девять': 9,
    'десять': 10,
    'одиннадцать': 11, 'двенадцать': 12, 'тринадцать': 13, 'четырнадцать': 14,
    'пятнадцать': 15, 'шестнадцать': 16, 'семнадцать': 17, 'восемнадцать': 18, 'девятнадцать': 19,
    'двадцать': 20, 'тридцать': 30, 'сорок': 40, 'пятьдесят': 50,
    'шестьдесят': 60, 'семьдесят': 70, 'восемьдесят': 80, 'девяносто': 90,
    'сто': 100, 'ста': 100, 'двести': 200, 'триста': 300, 'четыреста': 400,
    'пятьсот': 500, 'шестьсот': 600, 'семьсот': 700, 'восемьсот': 800, 'девятьсот': 900,
    'сотка': 100, 'сотку': 100, 'сотен': 100,
    'пятихатка': 500, 'пятихатку': 500,
    'косарь': 1000, 'косаря': 1000, 'косарей': 1000, 'штука': 1000, 'штуку': 1000, 'штуки': 1000, 'тыща': 1000, 'тыщу': 1000,
    'тысяча': 1000, 'тысячи': 1000, 'тысяч': 1000,
    'миллион': 1000000, 'миллиона': 1000000, 'миллионов': 1000000
  };

  const isNumWord = (w) => {
    return NUM_WORDS[w] !== undefined ||
           w === 'полторы' || w === 'полтора' || w === 'полтораста';
  };

  function wordsToNumber(words) {
    for (const w of words) {
      if (!isNumWord(w)) return null;
    }

    let total = 0;
    let current = 0;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];

      if (w === 'полторы' || w === 'полтора') {
        if (i + 1 < words.length && (words[i + 1].startsWith('тысяч') || words[i + 1].startsWith('тыщ'))) {
          current += 1500;
          i++;
        } else {
          current += 1.5;
        }
        continue;
      }

      if (w === 'полтораста') {
        current += 150;
        continue;
      }

      const val = NUM_WORDS[w];
      if (val === 1000 || val === 1000000) {
        if (current === 0) current = 1;
        total += current * val;
        current = 0;
      } else {
        current += val;
      }
    }
    return total + current;
  }

  let extractedAmount = 0;
  let remainingText = text;

  // 1 & 2. Collect all digit candidates (thousands-formatted like "3.700", "3 700", or regular/decimal like "450.50")
  const candidates = [];
  const numRegex = /(^|\s)(\d{1,3}(?:[.\s]\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?=\s|$|[.!?;:()"])/g;
  let m;
  while ((m = numRegex.exec(text)) !== null) {
    const leadingSpace = m[1].length;
    const rawNum = m[2];
    const startIdx = m.index + leadingSpace;
    const endIdx = startIdx + rawNum.length;

    let normalized;
    if (/^\d{1,3}(?:[.\s]\d{3})+(?:\.\d{1,2})?$/.test(rawNum)) {
      const decMatch = rawNum.match(/^(.*?)(\.\d{1,2})$/);
      if (decMatch && !/^\.\d{3}$/.test(decMatch[2])) {
        normalized = decMatch[1].replace(/[.\s]/g, '') + decMatch[2];
      } else {
        normalized = rawNum.replace(/[.\s]/g, '');
      }
    } else {
      normalized = rawNum;
    }

    const val = parseFloat(normalized);
    if (!isNaN(val) && val > 0) {
      candidates.push({ value: val, start: startIdx, end: endIdx, raw: rawNum });
    }
  }

  if (candidates.length === 1) {
    const only = candidates[0];
    extractedAmount = only.value;
    remainingText = (text.slice(0, only.start) + ' ' + text.slice(only.end)).trim();
  } else if (candidates.length > 1) {
    const currencyRe = /^(рублей|рубля|рубль|руб|р|₽)(\s|$|[.!?;:()"])/i;
    const pricePrepRe = /(^|\s)(за|на сумму|стоимостью|по цене|в размере)$/i;
    const unitRe = /^(шт|штук|штуки|штука|штучек|пачк[аиеу]?|пачек|литр(?:а|ов)?|л|кг|килограмм(?:а|ов)?|г|гр|грамм(?:а|ов)?|м|метр(?:а|ов)?|см|мм|пар[аы]?|уп|упаковк[аи]|бутыл(?:ка|ки|ок)|бан(?:ка|ки|ок)|рулон(?:а|ов)?|коробок|коробки)(\s|$|[.!?;:()"])/i;

    let bestCand = candidates[candidates.length - 1];
    let bestScore = -Infinity;

    candidates.forEach((cand, idx) => {
      let score = 0;
      const before = text.slice(0, cand.start).trim();
      const after = text.slice(cand.end).trim();

      if (currencyRe.test(after)) score += 100;
      if (pricePrepRe.test(before)) score += 50;
      if (unitRe.test(after)) score -= 100;
      if (idx === candidates.length - 1) score += 20;
      if (cand.value >= 10) score += 10;

      if (score > bestScore) {
        bestScore = score;
        bestCand = cand;
      }
    });

    extractedAmount = bestCand.value;
    remainingText = (text.slice(0, bestCand.start) + ' ' + text.slice(bestCand.end)).trim();
  }

  // 3. Number words (e.g. "три тысячи семьсот", "двести", "косарь")
  if (!extractedAmount) {
    const tokens = text.split(' ').filter(Boolean);
    let bestNum = 0;
    let bestSlice = null;

    for (let len = tokens.length; len >= 1; len--) {
      for (let start = 0; start <= tokens.length - len; start++) {
        const end = start + len;
        const slice = tokens.slice(start, end);
        const num = wordsToNumber(slice);
        if (num !== null && num > 0) {
          bestNum = num;
          bestSlice = { start, end };
          break;
        }
      }
      if (bestSlice) break;
    }

    if (bestNum > 0 && bestSlice) {
      extractedAmount = bestNum;
      const before = tokens.slice(0, bestSlice.start);
      const after = tokens.slice(bestSlice.end);
      remainingText = [...before, ...after].join(' ');
    }
  }

  // Clean up remaining description
  let cleanedDesc = remainingText
    .replace(/(^|\s)(рублей|рубля|рубль|руб|р|₽)($|\s)/gi, ' ')
    .replace(/(^|\s)(за|на сумму|стоимостью|по цене|в размере|купил|купила|оплатил|оплатила)($|\s)/gi, ' ')
    .replace(/(^|\s)(на)($|\s)/gi, ' ')
    .replace(/[.,!?;:()"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanedDesc.length > 0) {
    cleanedDesc = cleanedDesc.charAt(0).toUpperCase() + cleanedDesc.slice(1);
  }

  return {
    amount: extractedAmount,
    description: cleanedDesc,
    raw: rawText
  };
}

// Automated assertion tests
const tests = [
  ['3.700 руб', 3700, ''],
  ['3 700 руб', 3700, ''],
  ['3.700 кофе', 3700, 'Кофе'],
  ['430 хлеб', 430, 'Хлеб'],
  ['капучино и круассан 320', 320, 'Капучино и круассан'],
  ['такси до дома 650', 650, 'Такси до дома'],
  ['двести аптека', 200, 'Аптека'],
  ['такси за полторы тысячи рублей', 1500, 'Такси'],
  ['обед 450.50', 450.5, 'Обед'],
  ['обед 450,50', 450.5, 'Обед'],
  ['хлеб 250,5', 250.5, 'Хлеб'],
  ['косарь на бензин', 1000, 'Бензин'],
  ['25.000 кроссовки', 25000, 'Кроссовки'],
  ['чижик 2 пачки кофе 558', 558, 'Чижик 2 пачки кофе'],
  ['бензин 20 литров авто заправка 1300', 1300, 'Бензин 20 литров авто заправка'],
  ['2 тумблер батарея 196', 196, '2 тумблер батарея'],
  ['558 рублей 2 пачки кофе', 558, '2 пачки кофе'],
  ['1500 бензин 20 литров', 1500, 'Бензин 20 литров'],
  ['20 литров бензина за 1 300 руб', 1300, '20 литров бензина'],
  ['молоко 2 шт 180', 180, 'Молоко 2 шт']
];

let failed = 0;
tests.forEach(([phrase, expectedAmt, expectedDesc]) => {
  const res = parseVoiceExpense(phrase);
  const ok = res.amount === expectedAmt && res.description === expectedDesc;
  if (!ok) {
    failed++;
    console.error(`FAIL "${phrase}" -> got {amount: ${res.amount}, desc: "${res.description}"}, expected {amount: ${expectedAmt}, desc: "${expectedDesc}"}`);
  } else {
    console.log(`PASS "${phrase}" -> ${res.amount} ₽ | "${res.description}"`);
  }
});

if (failed > 0) {
  process.exit(1);
}
console.log(`\nALL ${tests.length} PARSER TESTS PASSED!`);
