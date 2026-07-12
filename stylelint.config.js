export default {
    extends: ['stylelint-config-standard'],
    rules: {
        'alpha-value-notation': null,
        'color-function-alias-notation': null,
        'color-function-notation': null,
        'color-hex-length': null,
        'comment-empty-line-before': null,
        'custom-property-pattern': null,
        'custom-property-empty-line-before': null,
        'declaration-block-single-line-max-declarations': null,
        'declaration-block-no-redundant-longhand-properties': null,
        'declaration-empty-line-before': null,
        'font-family-name-quotes': null,
        'import-notation': null,
        'keyframes-name-pattern': null,
        'media-feature-range-notation': null,
        'no-descending-specificity': null,
        'property-no-deprecated': null,
        'property-no-vendor-prefix': null,
        'rule-empty-line-before': null,
        'selector-class-pattern': null,
        'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global'] }],
        'value-keyword-case': null
    }
}
