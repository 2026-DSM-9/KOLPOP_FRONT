const MAP_SDK_ID = "kakao-map-sdk";
const POSTCODE_SDK_ID = "kakao-postcode-sdk";
const MAP_SDK_TIMEOUT = 10000;
const POSTCODE_SDK_URL = "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

let mapsSdkPromise = null;
let postcodeSdkPromise = null;

const getCurrentOrigin = () =>
  typeof window === "undefined" ? "현재 접속 중인 주소" : window.location.origin;

export const getKakaoServiceErrorMessage = () => {
  return `주소 검색을 사용하려면 Kakao Developers에서 OPEN MAP / LOCAL 서비스를 활성화하고 허용 도메인에 ${getCurrentOrigin()}를 등록해 주세요.`;
};

export const getNoAppKeyMessage = () => "VITE_KAKAO_MAP_APP_KEY를 설정하면 실제 지도가 활성화됩니다.";

export const getLoadErrorMessage = () =>
  `카카오맵 스크립트를 불러오지 못했습니다. Kakao Developers에서 JavaScript 키, OPEN MAP / LOCAL 활성화, 허용 도메인(${getCurrentOrigin()})을 확인해 주세요.`;

export const getKakaoMapErrorMessage = () => {
  return `카카오맵을 불러오지 못했습니다. Kakao Developers에서 JavaScript 키와 허용 도메인에 ${getCurrentOrigin()}를 등록했는지 확인해 주세요.`;
};

const createTimeout = (onTimeout) => window.setTimeout(onTimeout, MAP_SDK_TIMEOUT);

export function loadKakaoMapsSdk(appKey) {
  if (!appKey) {
    return Promise.reject(new Error(getNoAppKeyMessage()));
  }

  if (window.kakao?.maps) {
    return Promise.resolve(window.kakao);
  }

  if (mapsSdkPromise) {
    return mapsSdkPromise;
  }

  mapsSdkPromise = new Promise((resolve, reject) => {
    const rejectWithReset = (error) => {
      mapsSdkPromise = null;
      reject(error);
    };

    const handleError = () => {
      rejectWithReset(new Error(getLoadErrorMessage()));
    };

    const timeoutId = createTimeout(() => {
      rejectWithReset(new Error(getKakaoMapErrorMessage()));
    });

    const resolveAndClear = (value) => {
      window.clearTimeout(timeoutId);
      resolve(value);
    };

    const rejectAndClear = (error) => {
      window.clearTimeout(timeoutId);
      rejectWithReset(error);
    };

    const handleReadyWithClear = () => {
      if (!window.kakao?.maps) {
        rejectAndClear(new Error(getKakaoMapErrorMessage()));
        return;
      }

      window.kakao.maps.load(() => {
        if (window.kakao?.maps) {
          resolveAndClear(window.kakao);
          return;
        }

        rejectAndClear(new Error(getKakaoMapErrorMessage()));
      });
    };

    if (window.kakao?.maps) {
      handleReadyWithClear();
      return;
    }

    const existingScript = document.getElementById(MAP_SDK_ID);

    if (existingScript) {
      existingScript.addEventListener("load", handleReadyWithClear, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = MAP_SDK_ID;
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false&libraries=services`;
    script.addEventListener("load", handleReadyWithClear, { once: true });
    script.addEventListener("error", handleError, { once: true });
    document.head.append(script);
  });

  return mapsSdkPromise;
}

export function loadKakaoPostcodeSdk() {
  if (window.kakao?.Postcode || window.daum?.Postcode) {
    return Promise.resolve(window.kakao ?? window.daum);
  }

  if (postcodeSdkPromise) {
    return postcodeSdkPromise;
  }

  postcodeSdkPromise = new Promise((resolve, reject) => {
    const rejectWithReset = (error) => {
      postcodeSdkPromise = null;
      reject(error);
    };

    const handleReady = () => {
      if (window.kakao?.Postcode || window.daum?.Postcode) {
        resolve(window.kakao ?? window.daum);
        return;
      }

      rejectWithReset(new Error("주소 검색 서비스를 불러오지 못했습니다."));
    };

    const handleError = () => {
      rejectWithReset(new Error("주소 검색 스크립트를 불러오지 못했습니다."));
    };

    const existingScript = document.getElementById(POSTCODE_SDK_ID);

    if (existingScript) {
      existingScript.addEventListener("load", handleReady, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = POSTCODE_SDK_ID;
    script.async = true;
    script.src = POSTCODE_SDK_URL;
    script.addEventListener("load", handleReady, { once: true });
    script.addEventListener("error", handleError, { once: true });
    document.head.append(script);
  });

  return postcodeSdkPromise;
}
