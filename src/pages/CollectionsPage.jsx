import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import {
    Button as AriaButton,
    Dialog,
    DialogTrigger,
    Heading,
    Modal,
    ModalOverlay
} from '../ui/primitives/dialog'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { CheckSquareIcon } from '@phosphor-icons/react/dist/csr/CheckSquare'
import { FolderSimpleIcon } from '@phosphor-icons/react/dist/csr/FolderSimple'
import { ListChecksIcon } from '@phosphor-icons/react/dist/csr/ListChecks'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import { StarIcon } from '@phosphor-icons/react/dist/csr/Star'
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash'
import { UploadSimpleIcon } from '@phosphor-icons/react/dist/csr/UploadSimple'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import {
    getCollectionList,
    createCollection,
    deleteCollections,
    restoreCollections,
    importCollectionFromFile
} from '../data/collections'
import { LoadingState } from '../components/StateComponents'
import { Toast } from '../ui/primitives/Toast'
import styles from './CollectionsPage.module.css'

function CollectionsPage() {
    const navigate = useNavigate()
    const [collections, setCollections] = useState([])
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [newName, setNewName] = useState('')
    const [newDescription, setNewDescription] = useState('')
    const [importing, setImporting] = useState(false)
    const [importError, setImportError] = useState('')
    const [selectionMode, setSelectionMode] = useState(false)
    const [selectedIds, setSelectedIds] = useState([])
    const [showBulkDelete, setShowBulkDelete] = useState(false)
    const [lastDeleted, setLastDeleted] = useState([])

    const refreshCollections = () => setCollections(getCollectionList())

    useEffect(() => {
        refreshCollections()
    }, [])

    const standardCount = useMemo(
        () => collections.reduce((total, collection) => total + collection.standardCodes.length, 0),
        [collections]
    )
    const deletableCollections = useMemo(
        () => collections.filter(collection => collection.id !== 'default'),
        [collections]
    )

    useEffect(() => {
        if (!lastDeleted.length) return undefined
        const timeout = window.setTimeout(() => setLastDeleted([]), 6000)
        return () => window.clearTimeout(timeout)
    }, [lastDeleted])

    const handleCreate = event => {
        event.preventDefault()
        if (!newName.trim()) return

        const collection = createCollection(newName.trim(), newDescription.trim())
        refreshCollections()
        setShowCreateModal(false)
        setNewName('')
        setNewDescription('')
        navigate(`/collections/${collection.id}`)
    }

    const handleDelete = ids => {
        const deleted = deleteCollections(Array.isArray(ids) ? ids : [ids])
        if (!deleted.length) return
        setLastDeleted(deleted)
        setSelectedIds(previous => previous.filter(id => !deleted.some(collection => collection.id === id)))
        refreshCollections()
    }

    const handleUndoDelete = () => {
        restoreCollections(lastDeleted)
        refreshCollections()
        setLastDeleted([])
    }

    const toggleSelectionMode = () => {
        setSelectionMode(previous => {
            if (previous) setSelectedIds([])
            return !previous
        })
    }

    const toggleCollectionSelection = id => {
        setSelectedIds(previous => previous.includes(id)
            ? previous.filter(selectedId => selectedId !== id)
            : [...previous, id])
    }

    const toggleSelectAll = () => {
        setSelectedIds(previous => previous.length === deletableCollections.length
            ? []
            : deletableCollections.map(collection => collection.id))
    }

    const handleBulkDelete = () => {
        handleDelete(selectedIds)
        setShowBulkDelete(false)
        setSelectionMode(false)
        setSelectedIds([])
    }

    const handleImport = async event => {
        const file = event.target.files?.[0]
        if (!file) return

        setImporting(true)
        setImportError('')
        try {
            const imported = await importCollectionFromFile(file)
            refreshCollections()
            navigate(`/collections/${imported.id}`)
        } catch (error) {
            setImportError(`无法导入这个文件：${error.message}`)
        } finally {
            setImporting(false)
            event.target.value = ''
        }
    }

    return (
        <div className={styles.root} data-kb-route="collections">
            <section className={styles.hero} aria-labelledby="collections-title">
                <div className={`container ${styles.heroLayout}`}>
                    <div className={styles.heroCopy}>
                        <span className={styles.coordinate} aria-hidden="true">COLLECTION / LOCAL</span>
                        <h1 id="collections-title">我的清单</h1>
                        <p>把课程标准整理成可复用的教学与研究工作集。</p>
                    </div>
                    <dl className={styles.summary} aria-label="清单统计">
                        <div>
                            <dt>清单</dt>
                            <dd>{collections.length}</dd>
                        </div>
                        <div>
                            <dt>已收录标准</dt>
                            <dd>{standardCount}</dd>
                        </div>
                        <div>
                            <dt>保存位置</dt>
                            <dd>当前浏览器</dd>
                        </div>
                    </dl>
                </div>
            </section>

            <section className={styles.actions} aria-label="清单操作">
                <div className={`container ${styles.actionsRow}`}>
                    <DialogTrigger isOpen={showCreateModal} onOpenChange={setShowCreateModal}>
                        <AriaButton className={`btn btn-primary ${styles.actionButton}`}>
                            <PlusIcon size={18} weight="bold" aria-hidden="true" />
                            新建清单
                        </AriaButton>
                        <ModalOverlay className={styles.modalOverlay} isDismissable>
                            <Modal className={styles.modal}>
                                <Dialog className={styles.dialog} aria-label="新建清单">
                                    {({ close }) => (
                                        <>
                                            <div className={styles.dialogHeading}>
                                                <div>
                                                    <span>建立工作集</span>
                                                    <Heading slot="title">新建清单</Heading>
                                                </div>
                                                <AriaButton className={styles.dialogClose} onPress={close} aria-label="关闭新建清单对话框">
                                                    <XIcon size={20} aria-hidden="true" />
                                                </AriaButton>
                                            </div>
                                            <form onSubmit={handleCreate}>
                                                <div className={styles.formField}>
                                                    <label htmlFor="collection-name">清单名称 <span aria-hidden="true">*</span></label>
                                                    <input
                                                        id="collection-name"
                                                        type="text"
                                                        value={newName}
                                                        onChange={event => setNewName(event.target.value)}
                                                        placeholder="例如：三年级语文第一单元"
                                                        autoFocus
                                                        required
                                                    />
                                                </div>
                                                <div className={styles.formField}>
                                                    <label htmlFor="collection-description">描述（可选）</label>
                                                    <textarea
                                                        id="collection-description"
                                                        value={newDescription}
                                                        onChange={event => setNewDescription(event.target.value)}
                                                        placeholder="记录使用场景、教学主题或研究目的"
                                                        rows={4}
                                                    />
                                                </div>
                                                <div className={styles.dialogActions}>
                                                    <AriaButton className="btn btn-ghost" onPress={close}>取消</AriaButton>
                                                    <button type="submit" className="btn btn-primary" disabled={!newName.trim()} data-kb-telemetry-task="collection_create">创建清单</button>
                                                </div>
                                            </form>
                                        </>
                                    )}
                                </Dialog>
                            </Modal>
                        </ModalOverlay>
                    </DialogTrigger>

                    <label className={`btn btn-secondary ${styles.actionButton} ${styles.importButton}`}>
                        <UploadSimpleIcon size={18} aria-hidden="true" />
                        {importing ? '正在导入' : '导入清单'}
                        <input type="file" accept=".json,application/json" onChange={handleImport} disabled={importing} />
                    </label>
                    {deletableCollections.length ? (
                        <button
                            type="button"
                            className={`btn btn-ghost ${styles.actionButton} ${styles.selectionModeButton}`}
                            onClick={toggleSelectionMode}
                            aria-pressed={selectionMode}
                        >
                            <CheckSquareIcon size={18} aria-hidden="true" />
                            {selectionMode ? '退出选择' : '选择清单'}
                        </button>
                    ) : null}
                    <p className={styles.storageNote}>清单只保存在当前浏览器，可随时导出或打印。</p>
                </div>
            </section>

            <section className={styles.gridSection} aria-labelledby="collection-list-title" data-kb-component="collection-grid-section">
                <div className="container">
                    <div className={styles.sectionHeading}>
                        <div>
                            <span>工作集索引</span>
                            <h2 id="collection-list-title">全部清单</h2>
                        </div>
                        <p>{collections.length ? `共 ${collections.length} 个清单` : '尚未建立清单'}</p>
                    </div>

                    <AnimatePresence initial={false}>
                        {selectionMode ? (
                            <m.div
                                key="collection-selection-toolbar"
                                className={styles.selectionToolbar}
                                data-kb-component="collection-selection-toolbar"
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                            >
                                <div className={styles.selectionSummary} role="status" aria-live="polite">
                                    <strong>已选择 {selectedIds.length} 个清单</strong>
                                    <span>默认收藏夹始终保留；删除后可在 6 秒内撤销。</span>
                                </div>
                                <div className={styles.selectionActions}>
                                    <button type="button" className="btn btn-ghost" onClick={toggleSelectAll}>
                                        {selectedIds.length === deletableCollections.length ? '取消全选' : '全选可删除清单'}
                                    </button>
                                    <DialogTrigger isOpen={showBulkDelete} onOpenChange={setShowBulkDelete}>
                                        <AriaButton className={`btn ${styles.dangerButton}`} isDisabled={!selectedIds.length}>
                                            <TrashIcon size={18} aria-hidden="true" />
                                            删除所选
                                        </AriaButton>
                                        <ModalOverlay className={styles.modalOverlay} isDismissable>
                                            <Modal className={`${styles.modal} ${styles.confirmModal}`}>
                                                <Dialog className={styles.dialog} aria-label={`删除所选 ${selectedIds.length} 个清单`}>
                                                    {({ close }) => (
                                                        <>
                                                            <div className={styles.confirmIcon} aria-hidden="true"><TrashIcon size={24} /></div>
                                                            <Heading slot="title">删除 {selectedIds.length} 个清单</Heading>
                                                            <p>所选清单会从当前浏览器移除。确认后仍可通过页面底部通知撤销本次批量操作。</p>
                                                            <div className={styles.dialogActions}>
                                                                <AriaButton className="btn btn-ghost" onPress={close}>继续保留</AriaButton>
                                                                <AriaButton className={`btn ${styles.dangerButton}`} onPress={handleBulkDelete}>确认批量删除</AriaButton>
                                                            </div>
                                                        </>
                                                    )}
                                                </Dialog>
                                            </Modal>
                                        </ModalOverlay>
                                    </DialogTrigger>
                                </div>
                            </m.div>
                        ) : null}
                    </AnimatePresence>

                    {importing && <LoadingState message="正在解析清单文件" />}
                    {importError && (
                        <div className={styles.inlineError} role="alert">
                            <WarningCircleIcon size={20} aria-hidden="true" />
                            <span>{importError}</span>
                            <button type="button" onClick={() => setImportError('')}>关闭</button>
                        </div>
                    )}

                    <div className={styles.grid}>
                        {collections.map((collection, index) => {
                            const isDefault = collection.id === 'default'
                            const isSelected = selectedIds.includes(collection.id)
                            return (
                                <article
                                    key={collection.id}
                                    className={`${styles.card} ${isSelected ? styles.selected : ''}`}
                                    style={{ '--collection-index': `'${String(index + 1).padStart(2, '0')}'` }}
                                    data-selected={isSelected || undefined}
                                >
                                    <Link to={`/collections/${collection.id}`} className={styles.cardLink}>
                                        <div className={styles.cardIcon} aria-hidden="true">
                                            {isDefault
                                                ? <StarIcon size={22} weight="fill" />
                                                : <FolderSimpleIcon size={22} />}
                                        </div>
                                        <div className={styles.cardCopy}>
                                            <h3>{collection.name}</h3>
                                            {collection.description && <p>{collection.description}</p>}
                                        </div>
                                        <dl className={styles.cardMeta}>
                                            <div>
                                                <dt>标准</dt>
                                                <dd>{collection.standardCodes.length}</dd>
                                            </div>
                                            <div>
                                                <dt>创建日期</dt>
                                                <dd>{new Date(collection.createdAt).toLocaleDateString()}</dd>
                                            </div>
                                        </dl>
                                        <span className={styles.cardEnter}>
                                            打开清单 <ArrowRightIcon size={16} aria-hidden="true" />
                                        </span>
                                    </Link>

                                    {!isDefault && selectionMode ? (
                                        <label className={styles.selectionControl}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleCollectionSelection(collection.id)}
                                                aria-label={`选择清单 ${collection.name}`}
                                            />
                                            <CheckSquareIcon size={21} weight={isSelected ? 'fill' : 'regular'} aria-hidden="true" />
                                        </label>
                                    ) : null}

                                    {!isDefault && !selectionMode && (
                                        <DialogTrigger>
                                            <AriaButton className={styles.deleteButton} aria-label={`删除清单 ${collection.name}`}>
                                                <TrashIcon size={18} aria-hidden="true" />
                                            </AriaButton>
                                            <ModalOverlay className={styles.modalOverlay} isDismissable>
                                                <Modal className={`${styles.modal} ${styles.confirmModal}`}>
                                                    <Dialog className={styles.dialog} aria-label={`删除清单 ${collection.name}`}>
                                                        {({ close }) => (
                                                            <>
                                                                <div className={styles.confirmIcon} aria-hidden="true">
                                                                    <TrashIcon size={24} />
                                                                </div>
                                                                <Heading slot="title">删除“{collection.name}”</Heading>
                                                                <p>此操作会从当前浏览器移除该清单，且无法撤销。清单内的课程标准数据不会被删除。</p>
                                                                <div className={styles.dialogActions}>
                                                                    <AriaButton className="btn btn-ghost" onPress={close}>保留清单</AriaButton>
                                                                    <AriaButton className={`btn ${styles.dangerButton}`} onPress={() => handleDelete(collection.id)}>确认删除</AriaButton>
                                                                </div>
                                                            </>
                                                        )}
                                                    </Dialog>
                                                </Modal>
                                            </ModalOverlay>
                                        </DialogTrigger>
                                    )}
                                </article>
                            )
                        })}
                    </div>

                    {collections.length === 0 && (
                        <div className={styles.emptyState}>
                            <ListChecksIcon size={34} aria-hidden="true" />
                            <h3>从第一条课程标准开始</h3>
                            <p>新建清单后，可以从标准详情页持续加入内容。所有信息只保存在当前浏览器。</p>
                            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>创建第一个清单</button>
                        </div>
                    )}
                </div>
            </section>

            <Toast
                message={lastDeleted.length
                    ? `已删除 ${lastDeleted.length === 1 ? `“${lastDeleted[0].name}”` : `${lastDeleted.length} 个清单`}`
                    : ''}
                tone="info"
                actionLabel="撤销"
                onAction={handleUndoDelete}
                onDismiss={() => setLastDeleted([])}
            />
        </div>
    )
}

export default CollectionsPage
