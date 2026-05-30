# Boardroom Saga

Complete Realm example project for a corporate boardroom power-struggle simulation
set inside 锐峰科技 (Ruifeng Technologies). A 商战 counterpart to `cultivation-sim`,
built to prove the natural-language-first command center generalizes beyond 修真.

## Run

```bash
realm doctor
realm open --runtime fake
realm tui --once
```

For source checkout smoke tests:

```bash
bun run ../../apps/cli/src/index.ts open --runtime fake
bun run ../../apps/cli/src/index.ts tui --once
```

## What This Covers

- A simulation world with tick-based time measured in fiscal quarters (季度).
- Three role accounts (董事长 / CFO / 投资人) with private role-prompt skills.
- Project and world callable skills (季度推演、并购台账).
- Visibility rules for public, private, hidden, derived, and meta state.
- Believable 商战 content: 营收/现金流/股权结构/并购威胁/内部派系/隐藏的尽调黑料.
- State/log directories documented as local runtime output.

## Story Premise

锐峰科技正处在 IPO 前的关键季度。董事长 **陈牧** 想靠激进并购冲营收，CFO **林晚**
死守现金流与合规底线，外部投资人 **赵柯** 只关心退出回报。竞争对手正酝酿一场敌意收购，
审计风暴随时可能引爆隐藏的尽调黑料——谁能在董事会赢得控制权？

Copy `.agents/config.local.example.yaml` to `.agents/config.local.yaml` for machine-local provider overrides.
