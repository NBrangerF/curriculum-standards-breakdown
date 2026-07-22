import assert from 'node:assert/strict'
import { test } from 'node:test'

import { evaluateAlignmentPredictions } from '../scripts/textbooks/evaluate_llm_textbook_standard_alignments.js'

function multiCandidateGolden() {
  return [{
    case_id: 'multi-candidate-fixture',
    tags: ['multi_candidate'],
    expected: {
      candidates: [
        {
          candidate_id: 'specific-candidate',
          decision: 'accept',
          allowed_relation_types: ['practices'],
          learning_component_ids: ['lc_specific']
        },
        {
          candidate_id: 'near-candidate',
          decision: 'reject',
          allowed_relation_types: [],
          tags: ['known_false_positive']
        },
        {
          candidate_id: 'wrong-mechanism-candidate',
          decision: 'reject',
          allowed_relation_types: [],
          tags: ['known_false_positive']
        }
      ]
    },
    item: {
      candidates: [
        { candidate_id: 'specific-candidate' },
        { candidate_id: 'near-candidate' },
        { candidate_id: 'wrong-mechanism-candidate' }
      ]
    }
  }]
}

function correctMultiCandidatePredictions() {
  return [
    {
      case_id: 'multi-candidate-fixture',
      candidate_id: 'specific-candidate',
      decision: 'accept',
      relation_type: 'practices',
      learning_component_ids: ['lc_specific']
    },
    {
      case_id: 'multi-candidate-fixture',
      candidate_id: 'near-candidate',
      decision: 'reject',
      relation_type: null,
      learning_component_ids: []
    },
    {
      case_id: 'multi-candidate-fixture',
      candidate_id: 'wrong-mechanism-candidate',
      decision: 'reject',
      relation_type: null,
      learning_component_ids: []
    }
  ]
}

test('legacy single-candidate golden rows remain supported', () => {
  const report = evaluateAlignmentPredictions([{
    case_id: 'legacy-single',
    tags: ['positive'],
    expected: { decision: 'accept', allowed_relation_types: ['supports'] }
  }], [{
    case_id: 'legacy-single',
    decision: 'accept',
    relation_type: 'supports'
  }])

  assert.equal(report.metrics.cases, 1)
  assert.equal(report.metrics.candidate_expectations, 1)
  assert.equal(report.metrics.accepted_component_id_expectations, 0)
  assert.equal(report.metrics.accepted_component_id_accuracy, 1)
  assert.equal(report.passed, true)
})

test('multi-candidate cases score every candidate and pass only as a complete set', () => {
  const report = evaluateAlignmentPredictions(multiCandidateGolden(), correctMultiCandidatePredictions())

  assert.equal(report.metrics.cases, 1)
  assert.equal(report.metrics.candidate_expectations, 3)
  assert.equal(report.metrics.true_positive, 1)
  assert.equal(report.metrics.negative_rejection_rate, 1)
  assert.equal(report.metrics.accepted_relation_accuracy, 1)
  assert.equal(report.metrics.accepted_component_id_accuracy, 1)
  assert.equal(report.metrics.required_known_negative_cases, 2)
  assert.equal(report.metrics.multi_candidate_cases, 1)
  assert.equal(report.metrics.multi_candidate_cases_passed, 1)
  assert.equal(report.metrics.all_multi_candidate_cases_passed, true)
  assert.equal(report.case_summaries[0].passed, true)
  assert.equal(report.passed, true)
})

test('an accepted candidate must match the expected component ID set exactly', () => {
  const predictions = correctMultiCandidatePredictions()
  predictions[0] = {
    ...predictions[0],
    learning_component_ids: ['lc_specific', 'lc_redundant']
  }
  const report = evaluateAlignmentPredictions(multiCandidateGolden(), predictions)

  assert.equal(report.metrics.precision, 1)
  assert.equal(report.metrics.recall, 1)
  assert.equal(report.metrics.accepted_relation_accuracy, 1)
  assert.equal(report.metrics.accepted_component_id_accuracy, 0)
  assert.equal(report.metrics.multi_candidate_cases_passed, 0)
  assert.equal(report.metrics.all_multi_candidate_cases_passed, false)
  assert.equal(report.cases.find(row => row.candidate_id === 'specific-candidate').component_ids_correct, false)
  assert.equal(report.passed, false)
})
