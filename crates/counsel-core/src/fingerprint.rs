//! Runtime PressureFingerprint extraction (Phase 3.4).
//!
//! Given a case's raw input + defined problem text, score each of the 13
//! pressure axes (0-10) plus a cost-asymmetry label using keyword heuristics.
//! Used to query situation cards via cosine similarity in `build_system_prompt`.
//!
//! Why heuristic, not LLM: zero extra API cost per session, deterministic,
//! fast enough to run inline. An LLM-based extractor can replace this later
//! if the heuristic signal proves too coarse.

use crate::wisdom::PressureFingerprint;

/// Score a text against the 13 pressure axes by counting keyword hits.
///
/// Scale: each hit contributes ~2 points, capped at 10. Short inputs therefore
/// produce a sparse fingerprint; longer problem statements with more signal
/// words cluster toward characteristic axes.
pub fn extract(text: &str) -> PressureFingerprint {
    let t = text.to_lowercase();
    PressureFingerprint {
        time: score(&t, TIME),
        resource: score(&t, RESOURCE),
        survival: score(&t, SURVIVAL),
        competition: score(&t, COMPETITION),
        social: score(&t, SOCIAL),
        uncertainty: score(&t, UNCERTAINTY),
        identity: score(&t, IDENTITY),
        emotional: score(&t, EMOTIONAL),
        moral: score(&t, MORAL),
        face: score(&t, FACE),
        isolation: score(&t, ISOLATION),
        irreversibility: score(&t, IRREVERSIBILITY),
        info_completeness: 10u8.saturating_sub(score(&t, INFO_DEFICIT)),
        cost_asymmetry: classify_asymmetry(&t),
    }
}

fn score(text: &str, keywords: &[&str]) -> u8 {
    let mut hits = 0u32;
    for kw in keywords {
        if text.contains(kw) {
            hits += 1;
        }
    }
    (hits.saturating_mul(2)).min(10) as u8
}

fn classify_asymmetry(text: &str) -> String {
    let up_hits = UPSIDE.iter().filter(|k| text.contains(*k)).count();
    let down_hits = DOWNSIDE.iter().filter(|k| text.contains(*k)).count();
    let extreme_hits = EXTREME.iter().filter(|k| text.contains(*k)).count();
    if extreme_hits > 0 {
        "extreme".to_string()
    } else if down_hits >= 2 * up_hits.max(1) {
        "downside".to_string()
    } else if up_hits >= 2 * down_hits.max(1) {
        "upside".to_string()
    } else {
        "symmetric".to_string()
    }
}

const TIME: &[&str] = &[
    "截止", "deadline", "紧迫", "来不及", "明天", "下周", "本月底", "倒计时",
    "马上", "立刻", "urgent", "赶时间",
];
const RESOURCE: &[&str] = &[
    "没钱", "预算", "资金", "缺钱", "融资", "烧钱", "budget", "cash",
    "资源不足", "人手不够", "招不到",
];
const SURVIVAL: &[&str] = &[
    "倒闭", "破产", "失业", "生存", "活下去", "撑不住", "关门", "裁员",
    "bankrupt", "shut down", "失去工作",
];
const COMPETITION: &[&str] = &[
    "竞争对手", "对手", "抢市场", "同行", "被超越", "红海", "内卷",
    "competition", "rival", "被挤压",
];
const SOCIAL: &[&str] = &[
    "家人", "父母", "妻子", "丈夫", "配偶", "孩子", "老婆", "老公",
    "家里人", "爸妈", "亲人", "朋友", "spouse", "family", "parents",
];
const UNCERTAINTY: &[&str] = &[
    "不确定", "不知道", "看不清", "迷茫", "模糊", "说不准", "没把握",
    "uncertain", "unclear", "confused", "乱",
];
const IDENTITY: &[&str] = &[
    "我是谁", "身份", "使命", "天命", "人生方向", "自我价值", "意义感",
    "purpose", "identity", "who am i", "定位",
];
const EMOTIONAL: &[&str] = &[
    "焦虑", "抑郁", "痛苦", "恐惧", "害怕", "睡不着", "崩溃", "抓狂",
    "anxious", "depressed", "stressed", "情绪",
];
const MORAL: &[&str] = &[
    "道德", "良心", "正确", "对错", "原则", "底线", "ethics", "moral",
    "对不起", "愧疚", "罪恶感",
];
const FACE: &[&str] = &[
    "面子", "丢脸", "尊严", "体面", "难堪", "颜面", "face", "dignity",
    "被笑话", "shame",
];
const ISOLATION: &[&str] = &[
    "孤独", "没人懂", "独自", "只有我", "没人商量", "一个人扛",
    "alone", "lonely", "没人支持",
];
const IRREVERSIBILITY: &[&str] = &[
    "不可逆", "一锤子", "无法回头", "一次机会", "没有退路", "赌一把",
    "irreversible", "permanent", "no way back",
];
// Higher count = LESS info available, so we invert in extract().
const INFO_DEFICIT: &[&str] = &[
    "不知道", "没想清楚", "信息不足", "看不清", "数据不够", "没调研",
    "unclear", "don't know",
];

const UPSIDE: &[&str] = &[
    "机会", "窗口", "红利", "爆发", "增长潜力", "opportunity", "upside",
];
const DOWNSIDE: &[&str] = &[
    "风险", "损失", "代价", "亏损", "downside", "loss", "risk",
];
const EXTREME: &[&str] = &[
    "all in", "all-in", "压上", "赌上", "倾家荡产", "破釜沉舟",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_text_produces_defaults() {
        let fp = extract("");
        assert_eq!(fp.time, 0);
        assert_eq!(fp.resource, 0);
        assert_eq!(fp.info_completeness, 10);
        assert_eq!(fp.cost_asymmetry, "symmetric");
    }

    #[test]
    fn time_pressure_detected() {
        let fp = extract("下周一就是deadline，我来不及准备");
        assert!(fp.time >= 4, "time should fire, got {}", fp.time);
    }

    #[test]
    fn survival_pressure_detected() {
        let fp = extract("公司快要倒闭了，再撑不住就得关门");
        assert!(fp.survival >= 4, "survival should fire, got {}", fp.survival);
    }

    #[test]
    fn social_pressure_detected() {
        let fp = extract("家人都反对我创业，妻子也不支持");
        assert!(fp.social >= 2, "social should fire, got {}", fp.social);
    }

    #[test]
    fn identity_crisis_detected() {
        let fp = extract("我到底是谁？人生方向在哪里？");
        assert!(fp.identity >= 2);
    }

    #[test]
    fn info_completeness_inverted() {
        // "不知道" appears in UNCERTAINTY and INFO_DEFICIT; info should drop
        let fp_deficit = extract("不知道该怎么办，没想清楚");
        let fp_clear = extract("我已经研究过所有选项");
        assert!(fp_deficit.info_completeness < fp_clear.info_completeness);
    }

    #[test]
    fn extreme_asymmetry_detected() {
        let fp = extract("这次我打算all in，破釜沉舟");
        assert_eq!(fp.cost_asymmetry, "extreme");
    }

    #[test]
    fn downside_dominant_asymmetry() {
        let fp = extract("风险很大，可能损失所有投入的成本");
        assert_eq!(fp.cost_asymmetry, "downside");
    }

    #[test]
    fn multi_axis_fires_simultaneously() {
        let fp = extract(
            "deadline下周就到了，家人都反对，公司快倒闭了，我焦虑得睡不着。",
        );
        assert!(fp.time >= 2);
        assert!(fp.social >= 2);
        assert!(fp.survival >= 2);
        assert!(fp.emotional >= 2);
    }
}
