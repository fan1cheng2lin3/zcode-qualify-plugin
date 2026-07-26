# 规矩文件模板

> 复制这份模板,改名 `docs/constraints/{NNN}-{标题}.md`,填完即一条规矩。
> 规矩 = "现在生效什么"(铁律,短)。ADR = "为什么"(判决书,长)。
> 规矩文件里用 `from: ADR-0NN` 指回来源 ADR(可空)。

---

# {NNN} - {规矩标题}

```yaml
tag: {十大类之一}          # money/architecture/cache/testing/security/naming/database/frontend/persistence/other
status: active             # active(生效) / superseded(已作废)
from: ADR-0NN              # 来源 ADR(可空)
superseded_by: NNN         # 仅 status=superseded 时填
phases: [X, Y]             # 哪些 Phase 已遵守(可空,跟踪用)
```

## 规矩

{一句话铁律 + 简短理由}

## 例外

{无 / 列出例外场景}
