import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';
import { ProxyAgent } from 'proxy-agent';
import OpenAI from 'openai';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';
import fs from 'fs';

const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PROXY_URL = process.env.PROXY_URL; // e.g. socks5://user:pass@ip:port or http://user:pass@ip:port
const PROXY_SOCKS5 = process.env.PROXY_SOCKS5; // ip:port:login:password
const SKIP_PROXY_FOR_TELEGRAM = process.env.SKIP_PROXY_FOR_TELEGRAM;
const DISABLE_PROXY = process.env.DISABLE_PROXY; // '1' | 'true' to force no proxy

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is not set in .env');
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is not set. Image analysis will fail until you set it in .env');
}

function buildProxyUrl() {
  // If proxy is explicitly disabled, ignore all proxy vars
  if (parseBool(DISABLE_PROXY)) return undefined;
  if (PROXY_URL) {
    // Normalize to socks5h for remote DNS resolution
    if (PROXY_URL.startsWith('socks5://')) return PROXY_URL.replace('socks5://', 'socks5h://');
    if (PROXY_URL.startsWith('socks://')) return PROXY_URL.replace('socks://', 'socks5h://');
    return PROXY_URL;
  }
  if (PROXY_SOCKS5) {
    const parts = PROXY_SOCKS5.split(':');
    if (parts.length === 4) {
      const [host, port, user, password] = parts;
      return `socks5h://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}`;
    }
  }
  // Support HTTP proxy in ip:port:login:password format
  if (process.env.PROXY_HTTP) {
    const parts = process.env.PROXY_HTTP.split(':');
    if (parts.length === 4) {
      const [host, port, user, password] = parts;
      return `http://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}`;
    }
  }
  return undefined;
}

const proxyUrl = buildProxyUrl();
const agent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

// Ensure OpenAI also uses proxy via standard env
if (proxyUrl) {
  process.env.ALL_PROXY ||= proxyUrl;
  process.env.HTTP_PROXY ||= proxyUrl;
  process.env.HTTPS_PROXY ||= proxyUrl;
} else {
  // Explicitly clear any inherited proxy variables if user wants no proxy
  delete process.env.ALL_PROXY;
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
}

function parseBool(v) {
  if (v === undefined) return false;
  const s = String(v).toLowerCase().trim();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y';
}

const skipTgProxy = parseBool(SKIP_PROXY_FOR_TELEGRAM);

console.log('[startup]', {
  proxyUrl: proxyUrl || null,
  skipTelegramProxy: skipTgProxy,
  disableProxy: parseBool(DISABLE_PROXY),
});

const bot = new Telegraf(BOT_TOKEN, {
  telegram: {
    // Use proxy for Telegram only if not explicitly skipped
    agent: skipTgProxy ? undefined : agent,
  },
});

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Log Telegraf-level errors to terminal
bot.catch((err, ctx) => {
  console.error('Telegraf error:', err);
});

bot.start(async (ctx) => {
  const keyboard = Markup.inlineKeyboard([
    Markup.button.callback('\ud83d\udce4 \u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0441\u043d\u0438\u043c\u043e\u043a', 'send_photo'),
  ]);
  await ctx.reply(
    '\u041f\u0440\u0438\u0432\u0435\u0442! \u042f - \u0424\u043b\u0438\u043d, \u0442\u0432\u043e\u0439 \u0446\u0438\u0444\u0440\u043e\u0432\u043e\u0439 \u043f\u043e\u043c\u043e\u0449\u043d\u0438\u043a \u0432 \u043c\u0438\u0440\u0435 \u043b\u0443\u0447\u0435\u0432\u043e\u0439 \u0434\u0438\u0430\u0433\u043d\u043e\u0441\u0442\u0438\u043a\u0438.\n\u042f \u0443\u043c\u0435\u044e \u0430\u043d\u0430\u043b\u0438\u0437\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043c\u0435\u0434\u0438\u0446\u0438\u043d\u0441\u043a\u0438\u0435 \u0441\u043d\u0438\u043c\u043a\u0438 (\u0440\u0435\u043d\u0442\u0433\u0435\u043d, \u041c\u0420\u0422, \u041a\u0422, \u0423\u0417\u0418) \u0438 \u0434\u0430\u0432\u0430\u0442\u044c  \u043f\u043e \u043d\u0438\u043c \u043f\u043e\u0434\u0440\u043e\u0431\u043d\u043e\u0435, \u0441\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u043e\u0435 \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435 \u043d\u0430 \u043f\u043e\u043d\u044f\u0442\u043d\u043e\u043c \u044f\u0437\u044b\u043a\u0435.\n\u0412\u0430\u0436\u043d\u043e: \u042f \u043d\u0435 \u0441\u0442\u0430\u0432\u043b\u044e \u0434\u0438\u0430\u0433\u043d\u043e\u0437\u044b. \u041c\u043e\u044f \u0437\u0430\u0434\u0430\u0447\u0430 \u2014 \u043f\u043e\u043c\u043e\u0447\u044c \u0442\u0435\u0431\u0435 \u0438 \u0442\u0432\u043e\u0435\u043c\u0443 \u0432\u0440\u0430\u0447\u0443 \u0431\u044b\u0441\u0442\u0440\u0435\u0435 \u0440\u0430\u0437\u043e\u0431\u0440\u0430\u0442\u044c\u0441\u044f \u0432 \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u0438. \u0427\u0435\u043c \u043c\u043e\u0433\u0443 \u0431\u044b\u0442\u044c \u043f\u043e\u043b\u0435\u0437\u0435\u043d?',
    keyboard
  );
});

bot.action('send_photo', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('Жду снимок ');
  await ctx.reply('Жду снимок 📸');
});

bot.on('photo', async (ctx) => {
  try {
    await ctx.reply('⏳ Анализ изображения...');

    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;

    // Get file path
    const file = await ctx.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

    // Download via axios through proxy agent if present
    const response = await axios.get(fileUrl, {
      responseType: 'arraybuffer',
      // If proxy is skipped for Telegram, do not proxy file download either
      httpAgent: skipTgProxy ? undefined : agent,
      httpsAgent: skipTgProxy ? undefined : agent,
      // If no proxy in use, make sure axios doesn't try system proxy
      proxy: skipTgProxy || !agent ? false : undefined,
    });
    const imgB64 = Buffer.from(response.data).toString('base64');

    // OpenAI vision via Responses API
    const aiResp = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text:
                'Представь, что ты опытный врач лучевой диагностики (рентген, КТ, МРТ, УЗИ). По предоставленному изображению определи тип исследования (рентгенография, КТ, МРТ, УЗИ и т.п.) и составь профессиональное, но понятное заключение специально для врача-травматолога.\n' +
                'Если это исследование позвоночника, обязательно оцени ось позвоночника: есть ли сколиоз, кифоз, лордоз, выпрямление физиологических изгибов, степень выраженности искривления и его локализация. Если есть какие-либо заметные деформации оси или формы позвонков/позвоночника, обязательно опиши их явно и не используй формулировки вроде «патология не выявлена».\n' +
                'Для КТ/МРТ уделяй внимание структуре костей, суставов и мягких тканей (диски, связки, мышцы, отёк, грыжи, гематомы и т.п.).\n' +
                'Для УЗИ описывай эхоструктуру органов и мягких тканей, наличие выпота, утолщений, участков повышенной/пониженной эхогенности, разрывов, гематом и др.\n' +
                'Если на УЗИ визуализируется плод, оцени ориентировочный срок беременности (гестационный возраст) по доступным признакам, положение и предлежание плода, расположение плаценты, примерное количество околоплодных вод, наличие или отсутствие обвития пуповиной, а также видимые врождённые пороки развития или другие подозрительные патологии. При малой информативности снимка обязательно укажи, что оценка ограничена.\n' +
                'Даже если тип исследования до конца неясен, всё равно опиши те патологические и пограничные изменения, которые визуально заметны, и явно укажи ограничения интерпретации. Строго придерживайся структуры:\n' +
                '1) Область исследования (что за сустав/кость и в каких проекциях, если это можно понять).\n' +
                '2) Качество снимка (удовлетворительное/ограничено, если есть артефакты).\n' +
                '3) Описание костных структур.\n' +
                '4) Суставная щель.\n' +
                '5) Мягкие ткани.\n' +
                '6) Дополнительные находки.\n' +
                '7) Заключение (чётко: есть ли перелом, его локализация, тип, смещение; есть ли осевая деформация позвоночника — сколиоз, кифоз, лордоз, выпрямление изгибов; если видимых изменений нет, можно указать, что выраженной острой костной патологии не выявлено).\n' +
                '8) Краткие рекомендации (при необходимости: КТ/МРТ, контрольные снимки, клинико-рентгенологическая корреляция).\n' +
                'Не пиши длинных общих дисклеймеров, но помни, что окончательное решение остаётся за лечащим врачом. Отвечай по-русски.',
            },
            { type: 'input_image', image_url: `data:image/jpeg;base64,${imgB64}` },
          ],
        },
      ],
    });

    const text = aiResp.output_text || 'Не удалось получить ответ модели.';

    const firstLine = (text || '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)[0] || 'Описание по присланному снимку';

    const pdfBuffer = await generatePdfFromText(
      `Рентгенологическое заключение\n\n${text}\n\nПримечание: заключение носит предварительный характер и требует сверки с клиническими данными.`
    );

    await ctx.replyWithDocument(
      {
        source: pdfBuffer,
        filename: 'rentgenologicheskoe_zaklyuchenie.pdf',
      },
      {
        caption:
          `${firstLine}\n\n` +
          'Я подготовил предварительное описание по вашему лучевому исследованию (по присланному изображению). Эту информацию вы можете показать нужному специалисту для ускорения консультации.\n\n' +
          '📌 Важное напоминание: Данный анализ — вспомогательный. Окончательное заключение, диагноз и тактику лечения определяет только лечащий врач на основании очного осмотра, всех снимков и вашей истории болезни.\n\n' +
          '📅 Нужна помощь с записью к нужному специалисту? Я могу помочь найти врача рядом с вами.',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Записаться через Госуслуги',
                url: 'https://www.gosuslugi.ru/',
              },
            ],
          ],
        },
      }
    );
  } catch (e) {
    console.error('OpenAI analysis error:', e);
    await ctx.reply(`❌ Ошибка анализа: ${e.message || e}`);
  }
});

function generatePdfFromText(text) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      const fontsDirUrl = new URL('./fonts/', import.meta.url);
      const fontsDirPath = fileURLToPath(fontsDirUrl);
      const files = fs.readdirSync(fontsDirPath);
      const ttf = files.find((f) => f.toLowerCase().endsWith('.ttf'));

      if (ttf) {
        const fontUrl = new URL(`./fonts/${ttf}`, import.meta.url);
        const fontPath = fileURLToPath(fontUrl);
        doc.font(fontPath);
      } else {
        console.error('No .ttf font found in fonts directory, using default font');
      }
    } catch (e) {
      console.error('Font load error, using default font:', e);
    }

    doc.fontSize(12).text(text, {
      align: 'left',
    });

    doc.end();
  });
}

function pickSpecialistFromText(text) {
  const t = (text || '').toLowerCase();

  if (t.includes('позвоноч') || t.includes('позвонк') || t.includes('кость') || t.includes('сустав')) {
    return 'врачу-травматологу или ортопеду';
  }

  if (t.includes('головн') || t.includes('мозг') || t.includes('череп') || t.includes('инсульт') || t.includes('аневризм')) {
    return 'врачу-неврологу или нейрохирургу';
  }

  if (t.includes('печен') || t.includes('печень') || t.includes('желч') || t.includes('поджелуд') || t.includes('желудок') || t.includes('кишк') || t.includes('брюшн') || t.includes('живот')) {
    return 'врачу-гастроэнтерологу или абдоминальному хирургу';
  }

  if (t.includes('почек') || t.includes('почка') || t.includes('мочеточ') || t.includes('мочев') || t.includes('простата') || t.includes('предстат')) {
    return 'врачу-урологу или нефрологу';
  }

  if (t.includes('матк') || t.includes('яичник') || t.includes('беремен') || t.includes('плод') || t.includes('плацент') || t.includes('эндометри')) {
    return 'врачу-гинекологу или акушеру-гинекологу';
  }

  if (t.includes('легк') || t.includes('пневмон') || t.includes('плевр') || t.includes('бронх')) {
    return 'врачу-пульмонологу или терапевту';
  }

  return 'лечащему врачу или профильному специалисту';
}

bot.on('message', async (ctx) => {
  if (!('photo' in ctx.message)) {
    await ctx.reply('Отправьте, пожалуйста, изображение.');
  }
});

bot.launch().then(() => {
  console.log('Bot is running');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Global error handlers to make sure errors appear in terminal
process.on('unhandledRejection', (err) => {
  console.error('UnhandledRejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err);
});
