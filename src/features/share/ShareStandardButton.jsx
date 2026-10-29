import { useState } from 'react'
import { ShareNetworkIcon } from '@phosphor-icons/react/dist/csr/ShareNetwork'
import { Button, Dialog, Heading, Modal, ModalOverlay } from '../../ui/primitives/dialog.jsx'
import { copyToClipboard } from '../../data/query'
import { trackUmamiEvent } from '../../observability/umamiTelemetry.js'
import styles from './ShareStandardButton.module.css'

const CARD_VERSION = import.meta.env.VITE_KB_CARD_VERSION

// Opens the standard's share poster (apps/cards) with save and copy-link actions.
// WeChat's browser cannot download files, so there it asks for a long-press instead.
export default function ShareStandardButton({ code, title }) {
    const [open, setOpen] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [copyState, setCopyState] = useState('idle')
    const poster = `/cards/s/${encodeURIComponent(code)}/poster.png?v=${CARD_VERSION}`
    const inWeChat = /MicroMessenger/iu.test(navigator.userAgent)

    const openDialog = () => {
        setOpen(true)
        setCopyState('idle')
        trackUmamiEvent('share_open', { standard_code: code })
    }

    const copyLink = async () => {
        const copied = await copyToClipboard(`${window.location.origin}/standards/${code}`)
        setCopyState(copied ? 'copied' : 'error')
        if (copied) trackUmamiEvent('share_link_copy', { standard_code: code })
    }

    return (
        <>
            <button type="button" className="btn btn-secondary" data-kb-action="share-open" onClick={openDialog}>
                <ShareNetworkIcon size={17} aria-hidden="true" />
                分享图片
            </button>
            <ModalOverlay className={styles.overlay} isOpen={open} onOpenChange={setOpen} isDismissable>
                <Modal className={styles.modal}>
                    <Dialog className={styles.dialog}>
                        <Heading slot="title" className={styles.title}>分享这条课标</Heading>
                        <div className={styles.frame} data-loaded={loaded || undefined}>
                            {loaded ? null : <span className={styles.wait} role="status">正在生成分享图…</span>}
                            <img src={poster} alt={`${title}（${code}）的分享图`} width="1080" height="1440" onLoad={() => setLoaded(true)} />
                        </div>
                        <p className={styles.hint}>
                            {inWeChat ? '长按图片，保存或发送给朋友。' : '保存图片发到群里或朋友圈，扫码就能打开这条课标。'}
                        </p>
                        <div className={styles.actions}>
                            {inWeChat ? null : (
                                <a className="btn btn-primary" href={poster} download={`kebiao-${code}.png`} onClick={() => trackUmamiEvent('share_poster_save', { standard_code: code })}>
                                    保存图片
                                </a>
                            )}
                            <button type="button" className="btn btn-secondary" onClick={copyLink}>
                                {copyState === 'copied' ? '已复制链接' : copyState === 'error' ? '复制失败' : '复制链接'}
                            </button>
                            <Button slot="close" className={`btn btn-secondary ${styles.close}`}>关闭</Button>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </>
    )
}
