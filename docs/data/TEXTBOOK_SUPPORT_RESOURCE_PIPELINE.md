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

原始 manifest 使用 [resource_manifest.schema.json](../../data/textbooks/catalog/resource_manifest.schema.json)。运行时 TypeScript 合约位于 `packages/curriculum-core/src/textbooks`。

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

只使用当前 4 册地理图册构建实际目录：

```bash
node scripts/textbooks/build_textbook_resource_catalog.js
node scripts/textbooks/audit_textbook_resource_catalog.js
```

添加一个或多个资源 manifest：

```bash
node scripts/textbooks/build_textbook_resource_catalog.js \
  --manifest path/to/resources.json,path/to/more-resources.json \
  --out data/textbooks/catalog/support_resource_catalog.json
```

当前实际目录位于 `data/textbooks/catalog/support_resource_catalog.json`。运行公共数据构建后，同一份目录会写入 `public/data/textbooks/resources/index.json`，并自动完成两层兼容投影：

- `by-edition/<edition_id>.json` 的 `related_resources` 提供册级关系，`resource_unit_mappings` 与 `resource_unit_mapping_gaps` 保留完整单元关系和缺口；
- `units.json` 每个单元的 `related_resources` 只包含真正映射到该单元的资源章节，并带双方 PDF 页段。

因此现有教材详情与单元 API 无需另写资源关联逻辑。完整构建顺序为：

```bash
node scripts/textbooks/build_textbook_resource_catalog.js
node scripts/textbooks/build_textbook_public_data.js
node scripts/textbooks/audit_textbook_resource_catalog.js
```

`FileTextbookRepository` 同时提供缺文件兼容和双向图查询接口。

## 本地、X9 与 R2 导入

导入脚本默认仅生成计划，不写文件、不上传：

```bash
node scripts/textbooks/import_textbook_resources.js \
  --manifest path/to/resources.json
```

显式复制到内容寻址库（内部磁盘或 X9 都通过 `--library-root` 指定）：

```bash
node scripts/textbooks/import_textbook_resources.js \
  --manifest path/to/resources.json \
  --library-root "/Volumes/X9 Pro/kebiao-library" \
  --execute-local \
  --out data/textbooks/catalog/imported-resources.json
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

上传调用已登录的 Wrangler，目标键与本地完全相同：`objects/sha256/<前两位>/<sha256>.pdf`。`manifest_only` 和 `missing` 资源会保留书目与配对，但导入计划明确标记为 blocked。

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
