// Russian Speech Parser for Voice Expense
function parseVoiceExpense(rawText) {
  if (!rawText || !rawText.trim()) {
    return { amount: 0, description: '', raw: '' };
  }

  let text = rawText.trim().toLowerCase();

  // Normalize punctuation and symbols
  text = text.replace(/[,;]/g, ' ')
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

  // 1. Check for numbers with thousands formatting: e.g. "3.700", "25.000", "3 700", "1.500.000"
  const thousandsRegex = /\b(\d{1,3}(?:[.\s]\d{3})+)(?:[.,](\d{1,2}))?\b/;
  const thMatch = text.match(thousandsRegex);

  if (thMatch) {
    const wholeStr = thMatch[1].replace(/[.\s]/g, '');
    const decStr = thMatch[2] ? '.' + thMatch[2] : '';
    const parsedNum = parseFloat(wholeStr + decStr);
    if (!isNaN(parsedNum) && parsedNum > 0) {
      extractedAmount = parsedNum;
      remainingText = text.replace(thMatch[0], ' ');
    }
  }

  // 2. Normal digit match (single number or decimal with 1-2 digits): e.g. "430", "450.50", "250,5"
  if (!extractedAmount) {
    const digitRegex = /\b(\d+(?:[.,]\d{1,2})?)\b/;
    const digitMatch = text.match(digitRegex);
    if (digitMatch) {
      const numStr = digitMatch[1].replace(',', '.');
      const parsedNum = parseFloat(numStr);
      if (!isNaN(parsedNum) && parsedNum > 0) {
        extractedAmount = parsedNum;
        remainingText = text.replace(digitRegex, ' ');
      }
    }
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

// Run test cases
const testCases = [
  '3.700 руб',
  '3 700 руб',
  '3.700 кофе',
  '430 хлеб',
  'капучино и круассан 320',
  'такси до дома 650',
  'двести аптека',
  'такси за полторы тысячи рублей',
  'обед 450.50',
  'косарь на бензин',
  '25.000 кроссовки'
];

testCases.forEach(phrase => {
  const res = parseVoiceExpense(phrase);
  console.log(`"${phrase}" -> Amount: ${res.amount} ₽, Description: "${res.description}"`);
});
