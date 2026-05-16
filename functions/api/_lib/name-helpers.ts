// 한국어 받침 (jongseong) detect + 호칭 6 변형.
// 모든 고동 1인칭 LLM 호출 (godong-diary modal / hook generator / 향후 review 등) 공통 사용.
// 사용자 명시 2026-05-17 (_godong-llm-arch.md Section 3 → backend 이식).

export type NameHelpers = {
  hasJongseong: boolean;
  nameSubj: string;    // 주격: 영준이가 / 지우가
  nameTo: string;      // 여격: 영준이한테 / 지우한테
  nameAttr: string;    // attributive: 영준이 / 지우
  nameTopic: string;   // 주제: 영준이는 / 지우는
  nameCall: string;    // 호명 vocative: 영준아 / 지우야
  nameBare: string;    // bare: 영준 / 지우
};

export function buildNameHelpers(userName: string): NameHelpers {
  const name = (userName || '').trim();
  if (!name) {
    return {
      hasJongseong: false,
      nameSubj: '', nameTo: '', nameAttr: '',
      nameTopic: '', nameCall: '', nameBare: ''
    };
  }
  const last = name[name.length - 1];
  const code = last ? last.charCodeAt(0) : 0;
  // 한글 음절 범위 (가-힣) 안에서 종성 인덱스 = (code - 0xAC00) % 28. 0 이면 받침 없음.
  const hasJongseong = (code >= 0xAC00 && code <= 0xD7A3)
    ? ((code - 0xAC00) % 28) !== 0
    : false;
  return {
    hasJongseong,
    nameSubj:  hasJongseong ? `${name}이가`   : `${name}가`,
    nameTo:    hasJongseong ? `${name}이한테` : `${name}한테`,
    nameAttr:  hasJongseong ? `${name}이`     : name,
    nameTopic: hasJongseong ? `${name}이는`   : `${name}는`,
    nameCall:  hasJongseong ? `${name}아`     : `${name}야`,
    nameBare:  name,
  };
}
