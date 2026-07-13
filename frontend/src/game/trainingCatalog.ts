import { profiles } from "./sensitivity/sensitivity";

export type TrainingDifficultyId = "foundation" | "development" | "advanced" | "elite";
export type TrainingCategoryId = "clicking" | "micro" | "switching" | "tracking" | "reaction" | "tactical" | "movement" | "hybrid";
export type TrainingSkillId = "static-click" | "micro-correction" | "dynamic-click" | "precise-tracking" | "reactive-tracking" | "switching" | "movement" | "angle-control" | "recoil-control" | "ads-acquisition" | "projectile-lead" | "high-ttk-confirm";
export type TrainingInputStyle = "单发点击" | "持续射击" | "点击与跟枪" | "移动与射击";

export type TrainingCatalogEntry = {
  id: string;
  code: string;
  name: string;
  tag: string;
  description: string;
  method: string;
  coachCue: string;
  primaryMetric: string;
  durationSec: number;
  inputStyle: TrainingInputStyle;
  difficulty: TrainingDifficultyId;
  category: TrainingCategoryId;
  color: string;
  targetForm: string;
  trainingBasis: string;
  skills: TrainingSkillId[];
  games: string[];
  available: boolean;
  playableMode?: "grid";
};

export const trainingDifficulties: Array<{
  id: TrainingDifficultyId;
  code: string;
  label: string;
  eyebrow: string;
  description: string;
  color: string;
}> = [
  { id: "foundation", code: "F", label: "基础", eyebrow: "FOUNDATION", description: "先建立停稳再开枪、持续跟住和确认击杀后再转火的基本习惯。", color: "#70e8b2" },
  { id: "development", code: "D", label: "进阶", eyebrow: "DEVELOPMENT", description: "加入移动目标、大角度定位和射击节奏，让单项动作逐步接近真实对枪。", color: "#63dce8" },
  { id: "advanced", code: "A", label: "高阶", eyebrow: "ADVANCED", description: "在变向、近身、远距和短暂暴露窗口中保持稳定命中。", color: "#c99cff" },
  { id: "elite", code: "E", label: "专家", eyebrow: "ELITE", description: "把搜索、转身、移动和目标判断组合进高强度连续训练。", color: "#ffbd70" },
];

export const trainingCategories: Record<TrainingCategoryId, { label: string; eyebrow: string }> = {
  clicking: { label: "点击定位", eyebrow: "CLICKING" },
  micro: { label: "微调控制", eyebrow: "MICRO CONTROL" },
  switching: { label: "目标切换", eyebrow: "TARGET SWITCHING" },
  tracking: { label: "持续追踪", eyebrow: "TRACKING" },
  reaction: { label: "反应点击", eyebrow: "REACTION" },
  tactical: { label: "战术预瞄", eyebrow: "TACTICAL" },
  movement: { label: "移动协同", eyebrow: "MOVEMENT" },
  hybrid: { label: "综合控制", eyebrow: "HYBRID" },
};

export const trainingGameLabels: Record<string, string> = {
  cs2: "Counter-Strike 2",
  valorant: "VALORANT",
  apex: "Apex Legends",
  "overwatch-2": "Overwatch 2",
  "call-of-duty": "Call of Duty",
  fortnite: "Fortnite",
  "rainbow-six": "Rainbow Six",
  pubg: "PUBG",
  "delta-force": "Delta Force",
  crossfire: "CrossFire",
};

// "neon" is the native sensitivity profile, not a game recommendation target.
export const trainingGames = profiles
  .filter((profile) => profile.id !== "neon")
  .map((profile) => ({ id: profile.id, label: trainingGameLabels[profile.id] ?? profile.name }))
  .sort((left, right) => left.label.localeCompare(right.label, "en", { sensitivity: "base" }));

export const trainingSkillLabels: Record<TrainingSkillId, string> = {
  "static-click": "静态点击",
  "micro-correction": "末端微调",
  "dynamic-click": "动态点击",
  "precise-tracking": "精确追踪",
  "reactive-tracking": "反应追踪",
  switching: "目标切换",
  movement: "移动射击",
  "angle-control": "预瞄与清角",
  "recoil-control": "后坐与复位",
  "ads-acquisition": "开镜捕获",
  "projectile-lead": "弹道提前量",
  "high-ttk-confirm": "长时间击杀确认",
};

export const trainingGameProfiles: Record<string, { focus: string; ttkLabel: string; requiredSkills: TrainingSkillId[] }> = {
  cs2: { focus: "头线预瞄、急停首发、短扫复位和横拉目标的二次修正", ttkLabel: "短 TTK", requiredSkills: ["static-click", "micro-correction", "dynamic-click", "precise-tracking", "reactive-tracking", "switching", "movement", "angle-control", "recoil-control"] },
  valorant: { focus: "头部首发、架点反应、急停开枪和小身位目标的末端微调", ttkLabel: "短 TTK", requiredSkills: ["static-click", "micro-correction", "dynamic-click", "precise-tracking", "switching", "movement", "angle-control", "recoil-control"] },
  apex: { focus: "长时间跟枪、近身变向、纵向身法、换目标补枪和弹速预判", ttkLabel: "长 TTK", requiredSkills: ["static-click", "dynamic-click", "precise-tracking", "reactive-tracking", "switching", "movement", "ads-acquisition", "projectile-lead", "high-ttk-confirm"] },
  "overwatch-2": { focus: "不同体型英雄的持续跟枪、空中轨迹、近身高角速度和快速转火", ttkLabel: "英雄差异 / 长 TTK", requiredSkills: ["static-click", "dynamic-click", "precise-tracking", "reactive-tracking", "switching", "movement", "projectile-lead", "high-ttk-confirm"] },
  "call-of-duty": { focus: "开镜捕获、连续转火、近身反应和中远距离后坐控制", ttkLabel: "混合 TTK", requiredSkills: ["static-click", "dynamic-click", "precise-tracking", "reactive-tracking", "switching", "movement", "recoil-control", "ads-acquisition", "high-ttk-confirm"] },
  fortnite: { focus: "霰弹枪点击、编辑后暴露窗口、纵向目标、近身跟枪和弹道提前量", ttkLabel: "混合 / 偏长 TTK", requiredSkills: ["static-click", "dynamic-click", "precise-tracking", "reactive-tracking", "switching", "movement", "angle-control", "ads-acquisition", "projectile-lead", "high-ttk-confirm"] },
  "rainbow-six": { focus: "小角度清点、探头首发、开镜后微调和短点后坐控制", ttkLabel: "短 TTK", requiredSkills: ["static-click", "micro-correction", "dynamic-click", "precise-tracking", "switching", "movement", "angle-control", "recoil-control", "ads-acquisition"] },
  pubg: { focus: "中远距离弹道、步枪后坐、开镜捕获、掩体探头和移动目标跟枪", ttkLabel: "混合 TTK / 高后坐", requiredSkills: ["static-click", "micro-correction", "dynamic-click", "precise-tracking", "reactive-tracking", "switching", "movement", "angle-control", "recoil-control", "ads-acquisition", "projectile-lead"] },
  "delta-force": { focus: "中远距离首发、弹速提前量、开镜捕获、连续跟枪和后坐控制", ttkLabel: "混合 TTK", requiredSkills: ["static-click", "micro-correction", "dynamic-click", "precise-tracking", "reactive-tracking", "switching", "movement", "recoil-control", "ads-acquisition", "projectile-lead", "high-ttk-confirm"] },
  crossfire: { focus: "头线首发、急停开枪、短点复位，以及多目标之间的快速转火", ttkLabel: "短 TTK", requiredSkills: ["static-click", "micro-correction", "dynamic-click", "switching", "movement", "angle-control", "recoil-control"] },
};

const allGames = trainingGames.map((game) => game.id);
const tacticalGames = ["cs2", "valorant", "rainbow-six", "crossfire", "delta-force"];
const highTtkGames = ["apex", "overwatch-2", "call-of-duty", "fortnite", "delta-force"];
const smoothGames = ["cs2", "valorant", "apex", "overwatch-2", "call-of-duty", "fortnite", "rainbow-six", "pubg", "delta-force"];
const switchGames = ["apex", "overwatch-2", "call-of-duty", "fortnite", "pubg", "delta-force", "cs2", "valorant"];

type TrainingPlan = Omit<TrainingCatalogEntry, "code" | "color" | "skills" | "available" | "playableMode">;

// 31 distinct plans: 20 mouse-control fundamentals plus 11 drills that mirror common FPS fights.
const plans: TrainingPlan[] = [
  { id: "grid-shot", name: "GRID SHOT", tag: "全向点击", description: "在三个静止目标之间快速定位，练习一次拉到位并确认落点后开枪。", method: "场上始终保留三个互不遮挡的目标；命中后，系统会立即在新位置补充目标。", coachCue: "先停稳，再开枪。连续失误时主动降速，把每次点击重新做完整。", primaryMetric: "准确率 · TPM", durationSec: 60, inputStyle: "单发点击", difficulty: "foundation", category: "clicking", targetForm: "静止核心靶", trainingBasis: "静态点击 · 速度与落点", games: allGames },
  { id: "precision-dots", name: "PRECISION DOTS", tag: "静态精度", description: "瞄准更小的静止目标，强化大幅定位之后决定命中的末端微调。", method: "小目标分散在有限墙面；空枪会降低效率评分，并延后下一目标的刷新。", coachCue: "起手移动可以果断，接近目标时立即减速，避免在边缘反复修正。", primaryMetric: "准确率 · 微调时间", durationSec: 60, inputStyle: "单发点击", difficulty: "foundation", category: "clicking", targetForm: "小型静止目标", trainingBasis: "静态点击 · 小目标精度", games: allGames },
  { id: "micro-confirm", name: "MICRO CONFIRM", tag: "小幅修正", description: "集中训练准星接近目标后的最后一段修正，减少过调、回拉和慌乱补枪。", method: "小目标只在准星附近轮换；命中前不会消失，也不会通过超时自动跳过。", coachCue: "只完成必要位移；一旦越过目标就立刻刹停，不要继续扩大修正。", primaryMetric: "微调时间 · 过调率", durationSec: 60, inputStyle: "单发点击", difficulty: "foundation", category: "micro", targetForm: "近中心小目标", trainingBasis: "静态点击 · 末端微调", games: tacticalGames },
  { id: "horizontal-flow", name: "HORIZONTAL FLOW", tag: "水平平滑", description: "稳定跟随匀速横移目标，减少领先、落后和无效抖动。", method: "细目标沿水平路线往返，只在边界转向，不会瞬移或突然加速。", coachCue: "保持连续、均匀的输入，不要用一连串短促拉动追赶目标。", primaryMetric: "目标内时间 · 抖动", durationSec: 60, inputStyle: "持续射击", difficulty: "foundation", category: "tracking", targetForm: "水平移动目标", trainingBasis: "精确追踪 · 水平平滑", games: smoothGames },
  { id: "reactive-strafe", name: "REACTIVE STRAFE", tag: "横向变向", description: "跟住长短不一的横移，并在目标反向时快速刹停、重新贴回身体。", method: "人形目标会组合短、中、长横移段；所有转向都连续可见，不使用瞬移增加难度。", coachCue: "确认方向变化后再反拉；丢失目标时先找回身体中心，再恢复输出。", primaryMetric: "重新捕获时间", durationSec: 60, inputStyle: "持续射击", difficulty: "foundation", category: "tracking", targetForm: "随机横移人形", trainingBasis: "反应追踪 · 横向变向", games: ["cs2", "apex", "overwatch-2", "call-of-duty", "fortnite", "pubg", "delta-force"] },
  { id: "static-transfer", name: "STATIC TRANSFER", tag: "静态转火", description: "完成当前目标后再切换，训练清晰的击杀确认和更短的转火路径。", method: "四个静止目标拥有独立生命值；过早转火会让未完成目标恢复生命。", coachCue: "视线先寻找下一目标，准星在确认击杀后再移动，并优先落向目标中心。", primaryMetric: "转火时间 · 过早切换", durationSec: 60, inputStyle: "持续射击", difficulty: "foundation", category: "switching", targetForm: "静止生命值目标", trainingBasis: "目标切换 · 击杀确认", games: switchGames },
  { id: "headline-basics", name: "HEADLINE BASICS", tag: "爆头线", description: "让准星始终保持在头部高度，减少发现目标后再次抬枪的时间。", method: "目标距离各不相同，但头部位于清晰的水平区域；身体命中只记录，不计入主分。", coachCue: "转向下一个角度时也要守住头线，不要在目标之间放低准星。", primaryMetric: "头部命中率", durationSec: 60, inputStyle: "单发点击", difficulty: "foundation", category: "tactical", targetForm: "分层人形", trainingBasis: "实战迁移 · 头线预瞄", games: tacticalGames },

  { id: "wide-wall", name: "WIDE WALL", tag: "大角定位", description: "在更宽的视野内定位目标，训练大角度移动、提前减速和落点修正。", method: "六个视觉尺寸一致的目标覆盖水平视野；系统会补偿曲面距离造成的大小差异。", coachCue: "起手可以快，但减速必须提前；为最后一段精确控制留出空间。", primaryMetric: "命中间隔 · 准确率", durationSec: 60, inputStyle: "单发点击", difficulty: "development", category: "clicking", targetForm: "宽墙静止目标", trainingBasis: "静态点击 · 大角度定位", games: allGames },
  { id: "linear-click", name: "LINEAR CLICK", tag: "线性点击", description: "读取匀速目标的移动路线，在准星与目标重合的稳定时机完成单发。", method: "多个目标沿固定方向匀速移动，只有到达明确边界后才会反向。", coachCue: "先判断速度，再把准星送上轨迹；等待目标进入准星，不要一路追点。", primaryMetric: "移动目标命中率", durationSec: 60, inputStyle: "单发点击", difficulty: "development", category: "clicking", targetForm: "直线移动目标", trainingBasis: "动态点击 · 线性目标", games: allGames },
  { id: "arc-click", name: "ARC CLICK", tag: "弧线点击", description: "读取跳跃目标的起落轨迹，在运动最稳定的窗口完成有效点击。", method: "目标沿清晰的抛物线运动，只出现在前方视野，不会因边缘碰撞突然改线。", coachCue: "观察完整轨迹，不要追逐上一帧位置；优先把握顶点或落点附近的窗口。", primaryMetric: "动态命中率 · 节奏", durationSec: 60, inputStyle: "单发点击", difficulty: "development", category: "clicking", targetForm: "弧线移动目标", trainingBasis: "动态点击 · 跳跃轨迹", games: ["apex", "overwatch-2", "call-of-duty", "fortnite", "delta-force"] },
  { id: "thin-track", name: "THIN TRACK", tag: "精确追踪", description: "跟住窄小且持续变速的目标，暴露细微抖动、落后和过度修正。", method: "目标会连续加速和减速，但不会瞬间反向；纵向位移保持在较小范围。", coachCue: "让输入随目标速度连续变化，不要等距离拉开后再大幅追赶。", primaryMetric: "目标内时间 · 平滑度", durationSec: 60, inputStyle: "持续射击", difficulty: "development", category: "tracking", targetForm: "细长变速目标", trainingBasis: "精确追踪 · 细目标控制", games: smoothGames },
  { id: "vertical-control", name: "VERTICAL CONTROL", tag: "纵向跟枪", description: "集中训练纵向跟随，改善横向稳定但上下运动容易丢失目标的问题。", method: "目标会在数条垂直通道内升降，水平方向只保留少量偏移。", coachCue: "保持连续的上下输入；目标换向时先刹停，再沿新方向贴回。", primaryMetric: "纵向目标内时间", durationSec: 60, inputStyle: "持续射击", difficulty: "development", category: "tracking", targetForm: "升降轨迹目标", trainingBasis: "反应追踪 · 纵向控制", games: ["apex", "overwatch-2", "fortnite", "call-of-duty"] },
  { id: "health-switch", name: "HEALTH SWITCH", tag: "稳定转火", description: "持续跟住移动目标直到完成击杀，再平稳衔接下一个目标。", method: "三个横移目标拥有独立生命值；过早转火会让未完成目标恢复生命。", coachCue: "先完成当前击杀；转火时直接瞄向下一目标的移动前方。", primaryMetric: "击杀确认 · 转火稳定", durationSec: 60, inputStyle: "点击与跟枪", difficulty: "development", category: "switching", targetForm: "横移生命值目标", trainingBasis: "目标切换 · 长 TTK 衔接", games: highTtkGames },
  { id: "counter-strafe", name: "COUNTER STRAFE", tag: "急停首发", description: "从左右移动中快速停稳，并在恢复射击精度后立即命中头部。", method: "系统会读取玩家移动速度；只有进入有效射击窗口后的命中才计入主分。", coachCue: "先完成制动，再开枪；不要用提前射击猜测急停时机。", primaryMetric: "制动到首发时间", durationSec: 60, inputStyle: "移动与射击", difficulty: "development", category: "movement", targetForm: "中距人形", trainingBasis: "实战迁移 · 急停首发", games: ["cs2", "valorant", "crossfire"] },
  { id: "recoil-reset", name: "RECOIL RESET", tag: "后坐复位", description: "训练短点、停火和重新对准的节奏，避免上一轮后坐影响下一次首发。", method: "训练使用固定的基础后坐曲线；散布恢复后再开始下一组，才能获得完整控制分。", coachCue: "让每组射击明确结束；准星尚未复位时，不要急着开始下一轮连射。", primaryMetric: "复位节奏 · 有效命中", durationSec: 60, inputStyle: "点击与跟枪", difficulty: "development", category: "hybrid", targetForm: "分组战术人形", trainingBasis: "实战迁移 · 后坐复位", games: ["cs2", "valorant", "crossfire", "rainbow-six", "pubg", "delta-force", "call-of-duty"] },

  { id: "evasive-click", name: "EVASIVE CLICK", tag: "动态择机", description: "面对停顿、变速和反向目标，先读懂动作，再选择可靠的点击窗口。", method: "目标会在直线移动、短暂停顿和连续变速之间切换；空枪会降低准确率评分。", coachCue: "方向不明确时不要抢枪；目标运动稳定后，再完成一次干净点击。", primaryMetric: "动态命中率 · 读取", durationSec: 60, inputStyle: "单发点击", difficulty: "advanced", category: "clicking", targetForm: "变向移动目标", trainingBasis: "动态点击 · 变向判断", games: ["cs2", "valorant", "apex", "overwatch-2", "call-of-duty", "fortnite", "rainbow-six", "pubg", "delta-force"] },
  { id: "precision-lane", name: "PRECISION LANE", tag: "远距首发", description: "处理远距离小目标，在短暂暴露时间内把第一枪落到头部。", method: "目标只在远端水平区域短暂出现，身体与头部采用独立命中判定。", coachCue: "保持头线，只做必要微调；不要用连续点射掩盖首发失误。", primaryMetric: "首发命中 · 头部率", durationSec: 60, inputStyle: "单发点击", difficulty: "advanced", category: "reaction", targetForm: "远距人形", trainingBasis: "实战迁移 · 远距首发", games: ["cs2", "valorant", "rainbow-six", "pubg", "delta-force", "call-of-duty", "crossfire"] },
  { id: "airborne-read", name: "AIRBORNE READ", tag: "空中轨迹", description: "持续跟住起跳、滞空和下落目标，在纵向换向时保持有效覆盖。", method: "目标使用多种固定重力曲线；落地后会短暂停留，再开始下一次起跳。", coachCue: "上升时匹配速度，接近顶点时准备换向，但不要停止修正。", primaryMetric: "空中命中覆盖率", durationSec: 60, inputStyle: "持续射击", difficulty: "advanced", category: "tracking", targetForm: "空中人形", trainingBasis: "反应追踪 · 空中目标", games: ["apex", "overwatch-2", "fortnite", "call-of-duty"] },
  { id: "close-orbit", name: "CLOSE ORBIT", tag: "近身环绕", description: "跟住贴身绕行目标，适应高角速度并练习快速抬鼠复位。", method: "目标会交替从左右两侧绕行，不会在视野外无提示换向。", coachCue: "用手臂完成大幅跟随；鼠标空间不足时快速复位，同时保持目标方向。", primaryMetric: "近身目标内时间", durationSec: 60, inputStyle: "持续射击", difficulty: "advanced", category: "tracking", targetForm: "近身移动人形", trainingBasis: "反应追踪 · 近身高角速度", games: ["apex", "overwatch-2", "call-of-duty", "fortnite"] },
  { id: "dynamic-switch", name: "DYNAMIC SWITCH", tag: "动态转火", description: "在多个移动目标之间完成捕获、跟随、击杀确认和连续转火。", method: "目标独立移动，速度、生命值和相互距离均保持在明确范围内。", coachCue: "转火先捕获身体中心，贴稳后再输出；不要把大角度定位直接变成扫射。", primaryMetric: "有效转火率", durationSec: 60, inputStyle: "点击与跟枪", difficulty: "advanced", category: "switching", targetForm: "移动目标组", trainingBasis: "目标切换 · 动态目标", games: switchGames },
  { id: "depth-transfer", name: "DEPTH TRANSFER", tag: "远近切换", description: "在近、中、远距离目标之间转火，适应目标尺寸变化带来的不同控制幅度。", method: "三个距离层各保留一个目标；命中后，新目标会补充到不同距离层。", coachCue: "近目标更早刹停，远目标预留微调；不要用同一种幅度处理所有距离。", primaryMetric: "跨距离转火时间", durationSec: 60, inputStyle: "点击与跟枪", difficulty: "advanced", category: "switching", targetForm: "多距离人形", trainingBasis: "目标切换 · 距离变化", games: ["apex", "call-of-duty", "fortnite", "rainbow-six", "pubg", "delta-force"] },
  { id: "angle-hold", name: "ANGLE HOLD", tag: "架点反应", description: "守住预瞄位置，确认目标露出后，用第一枪处理短暂探头窗口。", method: "掩体位置会按规则轮流激活；提前开枪或只命中身体都会降低评分。", coachCue: "把准星放在目标将要出现的位置，并与墙边留出反应距离。", primaryMetric: "首发时间 · 首发命中", durationSec: 60, inputStyle: "单发点击", difficulty: "advanced", category: "tactical", targetForm: "掩体探头人形", trainingBasis: "实战迁移 · 架点首发", games: [...tacticalGames, "pubg"] },
  { id: "one-clip-control", name: "ONE CLIP CONTROL", tag: "持续击杀", description: "在一个弹匣内持续跟住高生命值目标，直到明确完成击杀。", method: "目标带有护甲并进行可读变向；换弹前未击杀会记为中断，提前转火不得分。", coachCue: "丢失枪线时先贴回身体中心，不要急着追头；子弹越少越要守住命中率。", primaryMetric: "单弹匣完成率", durationSec: 60, inputStyle: "持续射击", difficulty: "advanced", category: "tracking", targetForm: "高生命值移动人形", trainingBasis: "实战迁移 · 长 TTK 击杀", games: highTtkGames },
  { id: "ads-acquisition", name: "ADS ACQUISITION", tag: "开镜捕获", description: "从腰射视野切换到瞄准视野后快速找回目标，适应视野收窄和视觉速度变化。", method: "目标会出现在不同距离，并要求使用指定瞄准状态命中；视野与开镜时间按训练配置执行。", coachCue: "开镜前先把目标放到准星附近，动画结束后只做必要的小幅修正。", primaryMetric: "开镜到命中时间", durationSec: 60, inputStyle: "单发点击", difficulty: "advanced", category: "reaction", targetForm: "多距离开镜人形", trainingBasis: "实战迁移 · 开镜捕获", games: ["apex", "call-of-duty", "fortnite", "rainbow-six", "pubg", "delta-force"] },

  { id: "acceleration-track", name: "ACCELERATION TRACK", tag: "连续变速", description: "跟住持续加速和减速的目标，摆脱对固定速度节奏的依赖。", method: "速度变化连续且有明确上限，不会通过瞬时反向制造无法读取的失误。", coachCue: "根据当前速度持续调整输入，不要等距离拉开后再大幅追赶。", primaryMetric: "变速段目标内时间", durationSec: 75, inputStyle: "持续射击", difficulty: "elite", category: "tracking", targetForm: "连续变速目标", trainingBasis: "精确追踪 · 连续变速", games: highTtkGames },
  { id: "multi-axis-control", name: "MULTI-AXIS CONTROL", tag: "三轴控制", description: "目标同时横移、升降并改变距离时，仍将准星稳定保持在有效命中区域。", method: "三种位移由连续曲线组合；系统会补偿距离变化，避免尺寸缩放干扰追踪判断。", coachCue: "先跟主要运动方向，再补次要方向；避免多次大幅修正相互干扰。", primaryMetric: "三轴覆盖率 · 平滑度", durationSec: 75, inputStyle: "持续射击", difficulty: "elite", category: "tracking", targetForm: "三维轨迹目标", trainingBasis: "精确追踪 · 多轴变化", games: highTtkGames },
  { id: "full-turn-switch", name: "FULL-TURN SWITCH", tag: "全向转火", description: "搜索并处理身侧与身后的目标，训练大角度转身、重新定向和鼠标复位。", method: "目标会按环形分区生成；系统不会连续刷新背后目标，也不会用完全随机的位置堆叠难度。", coachCue: "先转向大致方位，再捕获目标并刹停；空间不足时立即抬鼠复位。", primaryMetric: "全向转火时间", durationSec: 75, inputStyle: "点击与跟枪", difficulty: "elite", category: "switching", targetForm: "环形目标组", trainingBasis: "目标切换 · 全向搜索", games: ["apex", "overwatch-2", "call-of-duty", "fortnite", "delta-force"] },
  { id: "burst-transfer", name: "BURST TRANSFER", tag: "短点转火", description: "用受控短点完成击杀，并在停火复位期间衔接下一个目标。", method: "每个目标需要固定命中数；连射过长会扩大散布并降低有效输出评分。", coachCue: "一组短点结束后立即停火，把复位时间用于寻找下一个头位。", primaryMetric: "有效短点率 · 转火", durationSec: 75, inputStyle: "点击与跟枪", difficulty: "elite", category: "hybrid", targetForm: "中距战术人形", trainingBasis: "实战迁移 · 短点转火", games: ["cs2", "valorant", "crossfire", "rainbow-six", "pubg", "delta-force", "call-of-duty"] },
  { id: "peek-confirm", name: "PEEK CONFIRM", tag: "多点探头", description: "在多个掩体窗口之间转移预瞄，确认目标出现后完成稳定首发。", method: "三个掩体位置会按受控随机顺序激活；未激活位置不会生成用于误导反应的假目标。", coachCue: "每次转点都先放好准星，再等待目标暴露；不要在多个位置之间反复猜测。", primaryMetric: "发现到命中时间", durationSec: 75, inputStyle: "单发点击", difficulty: "elite", category: "tactical", targetForm: "多掩体人形", trainingBasis: "实战迁移 · 清角与暴露窗口", games: [...tacticalGames, "fortnite", "pubg"] },
  { id: "movement-duel", name: "MOVEMENT DUEL", tag: "对枪协同", description: "在自身横移和变向时处理反向移动目标，训练身法与准星补偿的协同。", method: "玩家和目标独立移动；有效射击窗口会根据所选游戏的移动规则调整。", coachCue: "主动补偿自身移动造成的相对位移；需要准确首发时，先完成制动。", primaryMetric: "移动输出 · 制动质量", durationSec: 75, inputStyle: "移动与射击", difficulty: "elite", category: "movement", targetForm: "对枪人形", trainingBasis: "实战迁移 · 移动对枪", games: allGames },
  { id: "projectile-lead", name: "PROJECTILE LEAD", tag: "弹道预判", description: "根据目标速度、距离和弹丸飞行时间计算提前量，训练非即时命中武器。", method: "训练提供多档明确弹速和固定延迟；结果会显示提前量误差，不加入随机弹道偏移。", coachCue: "瞄向目标将要到达的位置；距离或横移速度增加时，同步增加提前量。", primaryMetric: "提前量误差 · 命中率", durationSec: 75, inputStyle: "单发点击", difficulty: "elite", category: "reaction", targetForm: "多距离移动人形", trainingBasis: "实战迁移 · 弹速提前量", games: ["apex", "overwatch-2", "fortnite", "pubg", "delta-force"] },
];

const planSkillMap: Record<string, TrainingSkillId[]> = {
  "grid-shot": ["static-click"],
  "precision-dots": ["static-click", "micro-correction"],
  "micro-confirm": ["micro-correction"],
  "horizontal-flow": ["precise-tracking"],
  "reactive-strafe": ["reactive-tracking"],
  "static-transfer": ["switching"],
  "headline-basics": ["static-click", "angle-control"],
  "wide-wall": ["static-click"],
  "linear-click": ["dynamic-click"],
  "arc-click": ["dynamic-click"],
  "thin-track": ["precise-tracking"],
  "vertical-control": ["precise-tracking", "reactive-tracking"],
  "health-switch": ["switching", "high-ttk-confirm"],
  "counter-strafe": ["static-click", "movement"],
  "recoil-reset": ["micro-correction", "recoil-control"],
  "evasive-click": ["dynamic-click"],
  "precision-lane": ["static-click", "angle-control"],
  "airborne-read": ["precise-tracking", "reactive-tracking"],
  "close-orbit": ["precise-tracking", "reactive-tracking"],
  "dynamic-switch": ["reactive-tracking", "switching"],
  "depth-transfer": ["switching"],
  "angle-hold": ["dynamic-click", "angle-control"],
  "one-clip-control": ["precise-tracking", "reactive-tracking", "high-ttk-confirm"],
  "ads-acquisition": ["dynamic-click", "ads-acquisition"],
  "acceleration-track": ["precise-tracking", "reactive-tracking"],
  "multi-axis-control": ["precise-tracking", "reactive-tracking"],
  "full-turn-switch": ["switching", "movement"],
  "burst-transfer": ["switching", "recoil-control"],
  "peek-confirm": ["dynamic-click", "angle-control"],
  "movement-duel": ["reactive-tracking", "movement"],
  "projectile-lead": ["dynamic-click", "projectile-lead"],
};

export const trainingCatalogEntries: TrainingCatalogEntry[] = plans.map((plan) => {
  const difficulty = trainingDifficulties.find((item) => item.id === plan.difficulty)!;
  const position = plans.filter((item) => item.difficulty === plan.difficulty).findIndex((item) => item.id === plan.id) + 1;
  const available = plan.id === "grid-shot";
  return {
    ...plan,
    skills: planSkillMap[plan.id] ?? [],
    code: `${difficulty.code}${String(position).padStart(2, "0")}`,
    // Card accents communicate difficulty only; the category is already named on the card.
    color: difficulty.color,
    available,
    ...(available ? { playableMode: "grid" as const } : {}),
  };
});

export function filterTrainingCatalog(
  entries: TrainingCatalogEntry[],
  filters: { game: "all" | string; difficulty: "all" | TrainingDifficultyId },
) {
  return entries.filter((entry) =>
    (filters.game === "all" || entry.games.includes(filters.game))
    && (filters.difficulty === "all" || entry.difficulty === filters.difficulty),
  );
}

export function rankTrainingCatalogForGame(entries: TrainingCatalogEntry[], gameId: "all" | string) {
  const profile = trainingGameProfiles[gameId];
  if (!profile) return entries;
  const sourceOrder = new Map(trainingCatalogEntries.map((entry, index) => [entry.id, index]));
  const score = (entry: TrainingCatalogEntry) => {
    const matchedSkills = entry.skills.filter((skill) => profile.requiredSkills.includes(skill)).length;
    const specificity = trainingGames.length - entry.games.length;
    return matchedSkills * 100 + specificity;
  };
  return [...entries].sort((left, right) =>
    score(right) - score(left)
    || (sourceOrder.get(left.id) ?? 0) - (sourceOrder.get(right.id) ?? 0),
  );
}

export function groupTrainingCatalogByDifficulty(entries: TrainingCatalogEntry[]) {
  return trainingDifficulties.map((difficulty) => ({
    ...difficulty,
    entries: entries.filter((entry) => entry.difficulty === difficulty.id),
  })).filter((group) => group.entries.length > 0);
}

const categoryTransferFocus: Record<TrainingCategoryId, string> = {
  clicking: "首发定位、快速捕获和点击时机",
  micro: "末端微调、小目标控制和过调修正",
  switching: "多目标转火、击杀确认和下一目标捕获",
  tracking: "持续命中、方向读取和平滑修正",
  reaction: "目标出现后的确认、反应和首发控制",
  tactical: "准星预置、角度处理和头部落点",
  movement: "自身移动下的准星补偿和射击窗口",
  hybrid: "武器节奏、转火和复合控制",
};

const gameSkillApplications: Record<string, Partial<Record<TrainingSkillId, string>>> = {
  cs2: {
    "static-click": "把首发落在头线",
    "micro-correction": "修正远点头位和小身位横拉",
    "dynamic-click": "处理宽拉与二次探头",
    "precise-tracking": "在连射前贴稳移动目标",
    "reactive-tracking": "跟回突然反向的横拉目标",
    switching: "应对双人拉出和补枪转火",
    movement: "把急停与首发接在一起",
    "angle-control": "按头线清点并守住预瞄位",
    "recoil-control": "控制短扫并及时复位",
  },
  valorant: {
    "static-click": "稳定步枪头部首发",
    "micro-correction": "修正小身位和远距离头位",
    "dynamic-click": "处理横拉与技能后重新露出的目标",
    "precise-tracking": "先贴稳移动目标再完成首发",
    switching: "连续处理同一入口的多个敌人",
    movement: "在急停完成后开出准确第一枪",
    "angle-control": "守住架点并按顺序清角",
    "recoil-control": "衔接短点与停火复位",
  },
  apex: {
    "static-click": "提升霰弹枪和单发武器的落点",
    "dynamic-click": "抓住滑铲、跳跃和掩体间隙的点击窗口",
    "precise-tracking": "维持中距离持续伤害",
    "reactive-tracking": "跟回近身变向和身法拉扯",
    switching: "在击倒、补枪和换目标之间快速衔接",
    movement: "移动对枪时补偿自身位移",
    "ads-acquisition": "开镜后迅速找回中远距离目标",
    "projectile-lead": "处理不同弹速下的远距离提前量",
    "high-ttk-confirm": "把一个弹匣的伤害完整送到击倒",
  },
  "overwatch-2": {
    "static-click": "提高即时命中英雄的单发落点",
    "dynamic-click": "抓住跳跃与技能位移后的点击窗口",
    "precise-tracking": "贴住不同体型英雄的有效命中区",
    "reactive-tracking": "跟回近身变向和快速位移",
    switching: "在前排、侧翼和低血量目标间快速转火",
    movement: "移动输出时抵消自身位移",
    "projectile-lead": "适应不同英雄的弹速和飞行时间",
    "high-ttk-confirm": "持续输出到目标真正被击杀",
  },
  "call-of-duty": {
    "static-click": "加快开镜后的第一发落点",
    "dynamic-click": "处理滑铲、跳跃和快速横穿目标",
    "precise-tracking": "维持中距离自动武器命中",
    "reactive-tracking": "应对近身变向和高速移动",
    switching: "连续处理同一区域的多个敌人",
    movement: "在移动和架枪之间保持准星补偿",
    "recoil-control": "压住中远距离连射并完成复位",
    "ads-acquisition": "缩短开镜到有效命中的时间",
    "high-ttk-confirm": "在 Warzone 护甲对枪中完成击杀确认",
  },
  fortnite: {
    "static-click": "提高霰弹枪单次暴露的伤害兑现",
    "dynamic-click": "抓住跳跃和编辑后的短暂点击窗口",
    "precise-tracking": "维持冲锋枪与步枪的持续命中",
    "reactive-tracking": "跟住盒内近战和纵向身法",
    switching: "在建筑遮挡变化后重新捕获目标",
    movement: "跳跃和横移开枪时补偿自身位移",
    "angle-control": "预瞄编辑口和掩体暴露位置",
    "ads-acquisition": "开镜后重新捕获中远距离目标",
    "projectile-lead": "处理弓弩等非即时命中武器",
    "high-ttk-confirm": "在护盾对枪里持续输出到击杀",
  },
  "rainbow-six": {
    "static-click": "稳定小头位的第一枪",
    "micro-correction": "修正开镜后的细小头位偏差",
    "dynamic-click": "处理快速探头和横穿窗口",
    "precise-tracking": "在短扫前贴稳横移目标",
    switching: "连续处理门窗和掩体后的多个威胁",
    movement: "探身移动时补偿准星偏移",
    "angle-control": "按小角度清点并守住架枪位",
    "recoil-control": "控制短点与连续射击的后坐",
    "ads-acquisition": "开镜后快速找回远近目标",
  },
  pubg: {
    "static-click": "提高单点与栓狙的首发落点",
    "micro-correction": "修正中远距离小目标的最后一段偏差",
    "dynamic-click": "处理跑动横穿和掩体间移动目标",
    "precise-tracking": "维持步枪开镜后的连续命中",
    "reactive-tracking": "跟回突然反向或蹲起的目标",
    switching: "在击倒、补枪和新威胁之间完成转火",
    movement: "侧身和移动对枪时补偿自身位移",
    "angle-control": "预瞄树木、窗口与斜坡后的探头位置",
    "recoil-control": "控制高后坐步枪的连射与复位",
    "ads-acquisition": "开镜后迅速找回中远距离目标",
    "projectile-lead": "根据距离、弹速和横移补足提前量",
  },
  "delta-force": {
    "static-click": "提高中远距离首发落点",
    "micro-correction": "修正远点小目标的最后一段偏差",
    "dynamic-click": "处理奔跑横穿和掩体间移动目标",
    "precise-tracking": "维持中距离自动武器命中",
    "reactive-tracking": "跟回突然变向的移动目标",
    switching: "在多目标交火中快速补枪转火",
    movement: "移动对枪时抵消自身位移",
    "recoil-control": "控制中远距离持续射击",
    "ads-acquisition": "缩短开镜搜索和重新捕获时间",
    "projectile-lead": "根据交战距离补足弹速提前量",
    "high-ttk-confirm": "面对护甲目标持续输出到击杀",
  },
  crossfire: {
    "static-click": "把步枪首发稳定在头线",
    "micro-correction": "处理远点头位和小幅横拉",
    "dynamic-click": "抓住横穿与探头目标的首发窗口",
    switching: "完成短点后的快速补枪转火",
    movement: "把急停节奏接到第一枪",
    "angle-control": "保持爆头线并守住架点",
    "recoil-control": "控制短点长度和停火复位",
  },
};

export function getTrainingGameFitReason(entry: TrainingCatalogEntry, gameId: string) {
  const profile = trainingGameProfiles[gameId];
  if (!profile) return `该训练用于强化${categoryTransferFocus[entry.category]}。`;
  const matchedSkills = entry.skills
    .filter((skill) => profile.requiredSkills.includes(skill));
  const applications = matchedSkills
    .map((skill) => gameSkillApplications[gameId]?.[skill])
    .filter((value): value is string => Boolean(value))
    .slice(0, 2);
  const fallback = matchedSkills.map((skill) => trainingSkillLabels[skill]).join("、") || categoryTransferFocus[entry.category];
  const useCase = applications.length > 0 ? applications.join("，同时") : `强化${fallback}`;
  return `${useCase}。${entry.targetForm}会直接检验${entry.primaryMetric}。`;
}
