// 謎の名言メーカー: テーマ語からそれっぽい格言と、架空の賢者の名前・肩書を組み合わせて生成する
// サーバー不要・外部通信ゼロ。すべてテンプレートの組み合わせ(架空の人物名・実在の思想とは無関係)。
"use strict";

const SUBJECT_DEFAULT = [
  "人生", "コーヒー", "月曜日", "宿題", "満員電車", "夕焼け", "スマホの通知",
  "猫", "洗濯物", "残業", "初恋", "台風", "筋トレ", "夜更かし", "推し活",
  "花粉症", "締め切り", "早起き", "片付け", "深夜のラーメン",
  "忘れ物", "既読スルー", "寝坊", "衝動買い", "三日坊主", "渋滞", "会議",
  "ダイエット", "引っ越し", "同窓会", "健康診断", "宝くじ",
];

const OPENERS = [
  (s) => `${s}とは、`,
  (s) => `${s}を知る者は、`,
  (s) => `人はみな、${s}の前では、`,
  (s) => `この世で最も${s}に近いものは、`,
  (s) => `${s}――それは、`,
  (s) => `真に${s}を愛した者だけが知る。`,
  (s) => `${s}に出会うまで、私たちは`,
  (s) => `気づけば${s}は、`,
  (s) => `${s}を侮ってはならない。なぜなら、それは`,
  (s) => `誰も教えてくれないが、${s}は`,
  (s) => `${s}の正体を見破った者は、こう語った。`,
  (s) => `もし${s}に意味を問うなら、答えはこうだ。`,
  (s) => `${s}を恐れる者は、`,
  (s) => `長い旅の果てにたどり着いた真実。${s}とは、`,
  (s) => `${s}――多くの者が見誤るが、実のところそれは`,
  (s) => `夜明け前、${s}についてこう悟った。`,
  (s) => `${s}を軽んじる者に、未来はない。なぜなら`,
  (s) => `結局のところ、${s}とは`,
];

const CORE_CLAUSES = [
  "終わりなき始まりである", "静寂の中にこそ真実が宿る", "選ばれし者にのみ微笑む",
  "見えぬものこそ、最も重い", "求める者から、静かに遠ざかる", "手放した瞬間に本当の姿を見せる",
  "問い続ける者だけがたどり着ける場所にある", "昨日の自分には決して理解できない",
  "光と影、その両方を併せ持つ", "誰にも気づかれず、静かに過ぎ去っていく",
  "一度知れば、二度と同じ目では見られない", "急ぐ者を嘲笑い、待つ者に微笑む",
  "言葉にした瞬間、その本質を失う", "遠くから見るほど、美しく見える",
  "受け入れた者にだけ、次の扉を開く", "すべての答えを持ち、何も語らない",
  "満ちる時も欠ける時も、同じ顔をしている", "探すのをやめた頃にふと現れる",
  "始まりと終わりを、同時に抱えている", "疑う者の前でこそ、その姿を隠す",
  "笑う者にも泣く者にも、平等に訪れる", "名付けた瞬間から、少しずつ形を変える",
  "背を向けた者を、いつまでも追いかけてくる", "沈黙の中でしか、本当の声を聞かせない",
  "望む者には遠く、望まぬ者には近い", "積み重ねた時間の分だけ、深みを増す",
];

const CONNECTORS = [
  "だが、", "しかし、", "それでも、", "ゆえに、", "だからこそ、",
  "そして、", "にもかかわらず、", "同時に、",
];

const SAGE_FIRST = ["風", "月", "雲", "静", "無", "空", "夢", "灯", "境", "刻", "霧", "波", "星", "炎"];
const SAGE_SECOND = ["谷", "水", "山", "野", "光", "音", "影", "路", "潮", "森", "岩", "泉", "峰", "砂"];
const SAGE_SUFFIX = ["翁", "老師", "仙人", "導師", "隠者", "行者", "居士", "聖"];

const TITLES = [
  "旅する哲学者", "名も無き賢者", "三日月に耳を澄ます者", "言葉を持たぬ詩人",
  "最後の夢想家", "路地裏の預言者", "誰も知らない賢人", "静寂を集める者",
  "風に問いかけた男", "忘れられた案内人", "百年に一度の変わり者", "山を降りない隠居",
  "灯を絶やさぬ旅人", "答えを持たない導師", "雲の上から見ていた者", "町外れの占い師",
  "時を数えない時計職人", "誰も呼ばない客人",
];

const CLOSER_TEMPLATES = [
  (sage, title) => `――${sage}（${title}）`,
  (sage, title) => `（${sage}の言葉より・${title}）`,
  (sage, title) => `と、かつて${sage}は${title}として語った`,
  (sage) => `――${sage}`,
  (sage, title) => `${title}・${sage}、談`,
  (sage, title) => `――伝${sage}（${title}）より`,
  (sage) => `そう遺したのは、${sage}であったという`,
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickExcluding(arr, excludeList) {
  const excludes = Array.isArray(excludeList) ? excludeList : [excludeList];
  const rest = arr.filter((v) => !excludes.includes(v));
  return pick(rest.length ? rest : arr);
}

function buildSage() {
  return `${pick(SAGE_FIRST)}${pick(SAGE_SECOND)}${pick(SAGE_SUFFIX)}`;
}

function generateQuote(rawSubject) {
  const subject = (rawSubject && rawSubject.trim().slice(0, 20)) || pick(SUBJECT_DEFAULT);
  const opener = pick(OPENERS)(subject);
  const core1 = pick(CORE_CLAUSES);
  let quote = opener + core1;
  const used = [core1];

  const r = Math.random();
  if (r < 0.7) {
    const core2 = pickExcluding(CORE_CLAUSES, used);
    quote += "。" + pick(CONNECTORS) + core2;
    used.push(core2);
    if (r < 0.2) {
      // まれに3節構成にして、文の長さ・リズムにも変化をつける
      const core3 = pickExcluding(CORE_CLAUSES, used);
      quote += "。" + pick(CONNECTORS) + core3;
    }
  }
  quote += "。";

  const sage = buildSage();
  const title = pick(TITLES);
  const closer = pick(CLOSER_TEMPLATES)(sage, title);

  return { subject, quote, sage, title, closer };
}

window.MeigenGenerator = { generateQuote };
