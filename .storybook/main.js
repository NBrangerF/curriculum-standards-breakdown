/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
    stories: ['../src/**/*.stories.@(js|jsx)'],
    addons: ['@storybook/addon-a11y'],
    framework: {
        name: '@storybook/react-vite',
        options: {}
    },
    staticDirs: ['../public']
}

export default config
