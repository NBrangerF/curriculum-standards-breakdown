import { Dialog, Popover } from '../ui/primitives/popover'
import styles from './FavoriteCollectionPopover.module.css'

export default function FavoriteCollectionPopover({
    code,
    collections,
    selectedCollections,
    triggerRef,
    onOpenChange,
    onCollectionToggle
}) {
    return (
        <Popover
            className={styles.popover}
            placement="bottom end"
            offset={6}
            isDismissable
            isOpen
            triggerRef={triggerRef}
            onOpenChange={onOpenChange}
        >
            <Dialog className={styles.menu} aria-label={`${code} 所属清单`}>
                <div className={styles.header}>添加到清单</div>
                {collections.map((collection, index) => (
                    <label key={collection.id} className={styles.item}>
                        <input
                            type="checkbox"
                            checked={selectedCollections.includes(collection.id)}
                            onChange={() => onCollectionToggle(collection.id)}
                            autoFocus={index === 0}
                        />
                        <span className={styles.name}>{collection.name}</span>
                        <span className={styles.count}>{collection.standardCodes.length}</span>
                    </label>
                ))}
            </Dialog>
        </Popover>
    )
}
