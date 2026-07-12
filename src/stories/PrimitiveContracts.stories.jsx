import { useState } from 'react'
import {
    Button,
    Checkbox,
    Dialog,
    DialogTrigger,
    Heading,
    Input,
    Label,
    Modal,
    ModalOverlay,
    SearchField,
    Tab,
    TabList,
    TabPanel,
    Tabs
} from '../ui/primitives'
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { CircleNotchIcon } from '@phosphor-icons/react/dist/csr/CircleNotch'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { Disclosure, DisclosureIndicator } from '../ui/primitives/Disclosure'
import { Skeleton } from '../ui/primitives/Skeleton'
import { Toast } from '../ui/primitives/Toast'
import { Tooltip } from '../ui/primitives/Tooltip'
import './PrimitiveContracts.stories.css'

const meta = {
    title: 'Foundation/Primitive contracts',
    parameters: { layout: 'fullscreen' }
}

export default meta

const ContractFrame = ({ title, description, children }) => (
    <main className="primitive-contract-frame">
        <header>
            <span>FOUNDATION / INTERACTION CONTRACT</span>
            <h1>{title}</h1>
            <p>{description}</p>
        </header>
        {children}
    </main>
)

export const ButtonStates = {
    render: () => (
        <ContractFrame title="Button" description="Default、pressed、loading、success、disabled 和 focus-visible 共享同一几何与焦点契约。">
            <div className="primitive-state-grid">
                <div><span>Default</span><Button className="btn btn-primary">保存到清单</Button></div>
                <div><span>Pressed</span><Button className="btn btn-secondary" aria-pressed="true">已加入清单</Button></div>
                <div><span>Loading</span><Button className="btn btn-primary" isDisabled><CircleNotchIcon className="primitive-spin" />正在保存</Button></div>
                <div><span>Success</span><Button className="btn primitive-success"><CheckIcon />保存成功</Button></div>
                <div><span>Disabled</span><Button className="btn btn-secondary" isDisabled>不可操作</Button></div>
            </div>
        </ContractFrame>
    )
}

export const SearchCheckboxAndTabs = {
    render: function SearchCheckboxTabsStory() {
        const [showProgression, setShowProgression] = useState(true)
        return (
            <ContractFrame title="SearchField · Checkbox · Tabs" description="键盘、触摸与读屏行为由 React Aria 提供，视觉状态由 kebiao token 控制。">
                <div className="primitive-contract-stack">
                    <SearchField className="primitive-search">
                        <Label>搜索课程标准</Label>
                        <div><MagnifyingGlassIcon aria-hidden="true" /><Input placeholder="标准编码、领域或能力" /><Button aria-label="清空搜索">×</Button></div>
                    </SearchField>
                    <Checkbox className="primitive-checkbox" isSelected={showProgression} onChange={setShowProgression}>
                        {({ isSelected }) => <><span aria-hidden="true">{isSelected ? <CheckIcon weight="bold" /> : null}</span>显示学段进阶关系</>}
                    </Checkbox>
                    <Tabs className="primitive-tabs" defaultSelectedKey="H2">
                        <TabList aria-label="学段">
                            <Tab id="H1">1–2年级 <code>H1</code></Tab>
                            <Tab id="H2">3–4年级 <code>H2</code></Tab>
                            <Tab id="H3">5–6年级 <code>H3</code></Tab>
                            <Tab id="H4G7">7年级 <code>H4G7</code></Tab>
                        </TabList>
                        <TabPanel id="H1">第一学段标准</TabPanel>
                        <TabPanel id="H2">第二学段标准</TabPanel>
                        <TabPanel id="H3">第三学段标准</TabPanel>
                        <TabPanel id="H4G7">七年级标准</TabPanel>
                    </Tabs>
                </div>
            </ContractFrame>
        )
    }
}

export const DialogContract = {
    render: () => (
        <ContractFrame title="Dialog" description="打开时锁定背景并把焦点送入标题区域；Escape 关闭后焦点返回触发器。">
            <DialogTrigger>
                <Button className="btn btn-primary">新建清单</Button>
                <ModalOverlay className="primitive-modal-overlay" isDismissable>
                    <Modal className="primitive-modal">
                        <Dialog className="primitive-dialog">
                            {({ close }) => <>
                                <span>COLLECTION / CREATE</span>
                                <Heading slot="title">新建清单</Heading>
                                <p>为课程标准建立一个可复用的研究工作集。</p>
                                <label>清单名称<input autoFocus placeholder="例如：空间观念研究" /></label>
                                <div><Button className="btn btn-ghost" onPress={close}>取消</Button><Button className="btn btn-primary" onPress={close}>创建清单</Button></div>
                            </>}
                        </Dialog>
                    </Modal>
                </ModalOverlay>
            </DialogTrigger>
        </ContractFrame>
    )
}

export const FeedbackLoadingAndDisclosure = {
    render: function FeedbackLoadingDisclosureStory() {
        const [isExpanded, setIsExpanded] = useState(false)
        return (
            <ContractFrame title="Tooltip · Toast · Skeleton · Disclosure" description="解释、反馈、等待和渐进展开共享轻量、可访问且可降级的 kebiao 契约。">
                <div className="primitive-feedback-grid">
                    <section>
                        <span>Tooltip</span>
                        <Tooltip content="复制标准 ID"><button type="button" className="btn btn-secondary">聚焦或悬停</button></Tooltip>
                    </section>
                    <section>
                        <span>Toast</span>
                        <Toast message="已加入空间观念研究清单" tone="success" onDismiss={() => {}} />
                    </section>
                    <section>
                        <span>Skeleton</span>
                        <Skeleton lines={4} />
                    </section>
                    <section>
                        <span>Disclosure</span>
                        <Disclosure
                            isExpanded={isExpanded}
                            onExpandedChange={setIsExpanded}
                            triggerClassName="primitive-disclosure-trigger"
                            panelClassName="primitive-disclosure-panel"
                            trigger={({ isExpanded: expanded }) => <><span>图形与几何</span><DisclosureIndicator isExpanded={expanded} /></>}
                        >
                            展开后保留课程标准的原始结构，关闭后焦点仍停留在触发器。
                        </Disclosure>
                    </section>
                </div>
            </ContractFrame>
        )
    }
}
