// 謎の名言メーカー: テーマ語からそれっぽい格言と、架空の賢者の名前・肩書を組み合わせて生成する
// サーバー不要・外部通信ゼロ。すべてテンプレートの組み合わせ(架空の人物名・実在の思想とは無関係)。
"use strict";

const SUBJECT_DEFAULT = [
  "人生", "コーヒー", "月曜日", "宿題", "満員電車", "夕焼け", "スマホの通知",
  "猫", "洗濯物", "残業", "初恋", "台風", "筋トレ", "夜更かし", "推し活",
  "花粉症", "締め切り", "早起き", "片付け", "深夜のラーメン",
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
];

const CONNECTORS = ["だが、", "しかし、", "それでも、", "ゆえに、", "だからこそ、"];

const SAGE_FIRST = ["風", "月", "雲", "静", "無", "空", "夢", "灯", "境", "刻"];
const SAGE_SECOND = ["谷", "水", "山", "野", "光", "音", "影", "路", "潮", "森"];
const SAGE_SUFFIX = ["翁", "老師", "仙人", "導師", "隠者", "行者"];

const TITLES = [
  "旅する哲学者", "名も無き賢者", "三日月に耳を澄ます者", "言葉を持たぬ詩人",
  "最後の夢想家", "路地裏の預言者", "誰も知らない賢人", "静寂を集める者",
  "風に問いかけた男", "忘れられた案内人",
];

const CLOSER_TEMPLATES = [
  (sage, title) => `――${sage}（${title}）`,
  (sage, title) => `（${sage}の言葉より・${title}）`,
  (sage, title) => `と、かつて${sage}は${title}として語った`,
  (sage) => `――${sage}`,
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickExcluding(arr, exclude) {
  const rest = arr.filter((v) => v !== exclude);
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

  if (Math.random() < 0.55) {
    const core2 = pickExcluding(CORE_CLAUSES, core1);
    quote += "。" + pick(CONNECTORS) + core2;
  }
  quote += "。";

  const sage = buildSage();
  const title = pick(TITLES);
  const closer = pick(CLOSER_TEMPLATES)(sage, title);

  return { subject, quote, sage, title, closer };
}

window.MeigenGenerator = { generateQuote };
