# 教师用书、教材全解与配套资源管道

## 目标与边界

这条管道把配套资源视为独立书目实体，而不是教材详情页上的一个 URL。它支持以下资源类型：

- `teacher_guide`：教师用书；
- `teaching_reference`：教学参考资料；
- `textbook_explanation`：教材全解或逐课解读；
- `workbook`：练习册、活动手册；
- `answer_key`：答案与解析；
- `student_companion`：学生配套图册等。

本管道只记录书目、结构、页码和关系。测试夹具不含教师用书正文；构建脚本不会下载或伪造资源。

## 四层数据模型

1. `resource`：资源书目及稳定 `resource_id / edition_id / work_id`。
2. `asset`：PDF 的内容寻址信息及稳定 `asset_id`；与书目身份分离。
3. `pairing`：资源与目标学生教材的册级关系，并记录匹配字段、冲突字段和未配对原因。
4. `unit_mapping`：目标教材单元与资源章节、双方 PDF 页段的具体关系。

原始 manifest 使用 [resource_manifest.schema.json](../../data/textbooks/catalog/resource_manifest.schema.json)。持久生成源位于 [support_resource_registry.json](../../data/textbooks/catalog/support_resource_registry.json)，它使用同一 schema 并进入版本控制。运行时 TypeScript 合约位于 `packages/curriculum-core/src/textbooks`。

`support_resource_catalog.json` 是可重建产物，不是导入入口。导入成功后需要显式 `--register`，将可移植书目、结构、内容寻址对象和单元映射原子写入 registry；随后不带任何 `--manifest` 的默认构建也会消费这些资源。registry 不保存 PDF 的原始绝对路径或外接硬盘路径。

## 稳定 ID

所有新 ID 都由规范化身份字段经过 SHA-256 截断产生，重复构建不会变化：

- `res_<24 hex>`：资源书目；
- `ed_<20 hex>`：资源版次；已有资产的 `edition_id` 原样保留；
- `asset_<24 hex>`：有二进制时取 PDF SHA-256 前 24 位，无二进制时取 manifest locator 哈希；
- `trs_<24 hex>`：资源章节；
- `trr_<24 hex>`：资源—教材关系；
- `trm_<24 hex>`：教材单元—资源章节关系；
- `trg_<24 hex>`：未完成单元映射的显式缺口。

资产换存储位置不会改变资源、版次或章节 ID；PDF 二进制变化只会改变 `asset_id`。

## 册级书目配对

配对首先匹配学段、学科、年级和册次，再比较出版社、适用版次和修订年。manifest 可用 `target.edition_id` 指向明确教材，但基础学段、学科、年级、册次仍必须兼容。

地理图册使用明确的 `geography_atlas → geography` 兼容规则；“配套人教版”可与“人教版”匹配，但不会把其他学科或年级自动接入。

每条结果都保留状态与原因：

- 成功：`explicit_target`、`exact_bibliographic_match`、`compatible_companion_edition`；
- 未成功：`target_not_found`、`subject_mismatch`、`grade_mismatch`、`volume_mismatch`、`publisher_mismatch`、`revision_mismatch`、`ambiguous_target`、`insufficient_bibliography`。

## 资源目录、页码与单元关系

资源 manifest 的 `structure.toc` 使用资源自己的章节树和 PDF/印刷页段。`unit_mappings` 可以明确声明教材 `target_unit_id` 与资源 `resource_section_ref` 的关系。

若没有显式关系，管道只对规范化后完全同名且唯一的章节自动配对。它不会根据宽泛关键词推断。无法映射时必须留下以下缺口之一：

- `target_structure_unavailable`；
- `resource_structure_unavailable`；
- `no_compatible_section`；
- `ambiguous_section`。

输出同时生成四个索引：`by_textbook`、`by_resource`、`by_textbook_unit`、`by_resource_section`。审计要求正反向 ID 集合完全相等。

## 构建与审计

使用当前 4 册地理图册以及持久 registry 构建实际目录：

```bash
node scripts/textbooks/build_textbook_resource_catalog.js
node scripts/textbooks/audit_textbook_resource_catalog.js
```

临时叠加一个或多个资源 manifest：

```bash
node scripts/textbooks/build_textbook_resource_catalog.js \
  --manifest path/to/resources.json,path/to/more-resources.json \
  --out data/textbooks/catalog/support_resource_catalog.json
```

默认 `--manifest-mode merge`：先读取当前图册和 registry，再按命令行顺序叠加显式 manifest；相同稳定 `resource_id` 以后者覆盖前者。需要完全忽略 registry 做隔离构建时，必须显式写：

```bash
node scripts/textbooks/build_textbook_resource_catalog.js \
  --manifest path/to/isolated-resources.json \
  --manifest-mode replace
```

`replace` 只替代 registry/显式 manifest 层，当前资产清单中的地理图册仍会进入目录。可用 `--registry path/to/registry.json` 指定另一份 registry（测试或迁移场景）；默认 registry 缺失会直接失败，避免静默丢资源。

当前实际目录位于 `data/textbooks/catalog/support_resource_catalog.json`。运行公共数据构建后，同一份目录会写入 `public/data/textbooks/resources/index.json`，并自动完成两层兼容投影：

- `by-edition/<edition_id>.json` 的 `related_resources` 提供册级关系，`resource_unit_mappings` 与 `resource_unit_mapping_gaps` 保留完整单元关系和缺口；
- `units.json` 每个单元的 `related_resources` 只包含真正映射到该单元的资源章节，并带双方 PDF 页段。

当资源资产为 `availability=available`，且 `asset_id / sha256 / bytes / pages / object_path` 构成完整的内容寻址 PDF 记录时，单元投影会将 `resource_reading_available` 设为 `true`。前端链接到 `/textbook-resources/<resource_id>/read?page=<PDF页>`，再通过 `POST /api/v1/textbook-resources/<resource_id>/viewer-session` 获取同源 Range 地址。服务端只解析受信任 registry/catalog 中的 `resource_id`，不接受客户端文件路径。

`resource_reading_available` 表示资源具备合格的 reader 元数据，不是实时存储探测；X9 掉线或 R2 暂时不可达时，会话接口返回 `503`，前端展示明确的不可用状态且不会请求 PDF。线上读取只接受统一桶（默认 `kebiao-textbooks`，可由 `TEXTBOOK_ASSET_BUCKET` 配置）和规范内容寻址 key。导入、标准化、目录审计、公共可读性投影和 API 会话使用同一约束：显式桶只能等于配置桶，`r2_key` 只能等于 `objects/sha256/<前两位>/<sha256>.pdf`；不合规 manifest 会在复制或上传前失败。

公开的 `public/data/textbooks/resources/index.json` 只保留阅读器需要的页数、文件大小、可用状态和书目结构；`sha256`、`object_path`、`r2_key`、桶名、本地路径及 provenance 定位信息统一脱敏为 `null`。完整内容寻址记录仅留在服务端数据目录。

因此现有教材详情与单元 API 无需另写资源关联逻辑。完整构建顺序为：

```bash
node scripts/textbooks/build_textbook_resource_catalog.js
node scripts/textbooks/build_textbook_public_data.js
node scripts/textbooks/audit_textbook_resource_catalog.js
```

`FileTextbookRepository` 同时提供缺文件兼容和双向图查询接口。

## 本地、X9 与 R2 导入

导入脚本默认仅生成计划，不写文件、不上传、也不登记：

```bash
node scripts/textbooks/import_textbook_resources.js \
  --manifest path/to/resources.json
```

确认书目、结构和单元映射后，将其登记为默认构建的数据源：

```bash
node scripts/textbooks/import_textbook_resources.js \
  --manifest path/to/resources.json \
  --register \
  --out output/textbook-resource-import/import-result.json
```

`--register` 默认采用 `--registration-mode merge`，按稳定 `resource_id` 更新或新增，未出现在本次 manifest 中的既有资源保留。只有在有意重建整个 registry 时才使用 `--registration-mode replace`。登记 manifest-only 资源同样有效；PDF 后续到位后，用相同资源身份再次登记即可补齐 asset 信息而不改变资源 ID。

教师用书、教学参考、教材全解、练习册和答案册默认继承自身书目中的 `publisher` 与 `revision_year` 作为教材配对条件。若 manifest 想覆盖为不同出版社或修订年，必须同时给出明确的目标 `edition_id`；多个教材同分时保持 `ambiguous`，不会自动挑选其中一册。地理图册等 `student_companion` 继续使用兼容版本规则。

`--execute-local` 或 `--upload-r2` 已经代表实际导入，因此只有在复制/上传全部成功后才会自动登记。恢复演练或一次性诊断若确实不希望改 registry，可显式使用 `--no-register`；纯计划模式仍然不会自动登记。

显式复制到内容寻址库（内部磁盘或 X9 都通过 `--library-root` 指定）：

```bash
node scripts/textbooks/import_textbook_resources.js \
  --manifest path/to/resources.json \
  --library-root "/Volumes/X9 Pro/kebiao-library" \
  --execute-local \
  --out output/textbook-resource-import/import-result.json
```

显式上传 R2：

```bash
node scripts/textbooks/import_textbook_resources.js \
  --manifest path/to/resources.json \
  --library-root "/Volumes/X9 Pro/kebiao-library" \
  --execute-local \
  --upload-r2 \
  --r2-bucket kebiao-textbooks
```

上传调用已登录的 Wrangler，目标键与本地完全相同：`objects/sha256/<前两位>/<sha256>.pdf`。`manifest_only` 和 `missing` 资源会保留书目与配对，但导入计划明确标记为 blocked。`--out` 中的执行计划可能包含本机源路径和 X9 目标路径，因此应写到已忽略的 `output/`，不要作为网站数据发布；registry 和最终 catalog 会移除这些本机路径，公共 `resources/index.json` 不会继承它们。

## 回归夹具

`tests/fixtures/textbook-resources/teacher-guide-manifest.fixture.json` 是只含合成元数据的教师用书夹具：

- 没有 PDF，也没有受版权保护的正文；
- 证明稳定 ID 生成；
- 证明教师用书与五年级上册语文教材配对；
- 证明教材第一单元 PDF 6–19 页与资源测试章节 PDF 1–12 页形成具体双向关系。

回归测试还会从现有资产清单读取 4 册地理图册，验证它们全部配到对应人教版地理教材；由于图册尚未提取目录，测试要求管道保留 `resource_structure_unavailable`，不得虚构单元关系。

```bash
node --test tests/textbook_resource_pipeline.test.mjs
npm --prefix packages/curriculum-core run typecheck
```
