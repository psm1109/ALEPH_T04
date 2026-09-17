export const FAILURE_PRESENTATION = Object.freeze({
  timeout: {
    title: '출처 응답 시간이 초과됐어요',
    description: '마지막 정상값을 유지하고 있으며 현재 값은 최신 조회 결과가 아닙니다.',
    action: '잠시 기다린 뒤 다시 조회해 주세요.',
    button: '다시 조회',
  },
  auth: {
    title: '출처 API 인증이 거절됐어요',
    description: '마지막 정상값을 유지하고 있으며 현재 값은 최신 조회 결과가 아닙니다.',
    action: '서비스 관리자에게 API 인증 설정 확인을 요청해 주세요.',
    button: '설정 확인 후 다시 조회',
  },
  rate_limit: {
    title: '출처 API 호출 한도에 도달했어요',
    description: '마지막 정상값을 유지하고 있으며 현재 값은 최신 조회 결과가 아닙니다.',
    action: '호출 한도가 초기화된 뒤 다시 조회해 주세요.',
    button: '나중에 다시 조회',
  },
  offline: {
    title: '출처 API에 연결할 수 없어요',
    description: '마지막 정상값을 유지하고 있으며 현재 값은 최신 조회 결과가 아닙니다.',
    action: '네트워크 연결을 확인한 뒤 다시 조회해 주세요.',
    button: '연결 확인 후 다시 조회',
  },
  schema_error: {
    title: '출처 응답 형식이 변경됐어요',
    description: '확인되지 않은 값을 저장하지 않고 마지막 정상값을 유지합니다.',
    action: '서비스 관리자에게 출처 데이터 형식 확인을 요청해 주세요.',
    button: '확인 후 다시 조회',
  },
});
