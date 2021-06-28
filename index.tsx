import {
  createContext,
  FunctionComponent,
  Key,
  ReactElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import styled from 'styled-components';

export type OpenPanelFunction<ResultType, PropType = undefined> = PropType extends undefined
  ? () => Promise<ResultType | null>
  : (props: PropType) => Promise<ResultType | null>;

export type ClosePanelFunction<PropType = undefined> = PropType extends undefined
  ? () => void
  : (props?: PropType) => void;

export type RegisterPanelFunction<ResultType = void, PropType = undefined> = (
  props: ManagedPanel<ResultType, PropType>
) => ReactElement<ManagedPanel<ResultType, PropType>>;

export interface PanelManagerContext {
  register: <ResultType = void, PropType = undefined>(
    registerPanelFunction: RegisterPanelFunction<ResultType, PropType>
  ) => OpenPanelFunction<ResultType, PropType>;
  dismiss: () => void;
}
export type ManagedPanel<ResultType = void, PropType = undefined> = PropType extends undefined
  ? {
    dismiss: () => void;
    close: ClosePanelFunction<ResultType>;
  }
  : {
    dismiss: () => void;
    close: ClosePanelFunction<ResultType>;
    props: PropType;
  };

export enum PanelManagerPosition {
  Left,
  Right
}

export interface PanelManagerContextProps {
  position?: PanelManagerPosition;
}

interface PromiseExecutor<ResultType> {
  resolve: (value: ResultType) => void;
  reject: () => void;
}

interface PanelExecutor<ResultType, PropType> {
  panel: ReactElement<ManagedPanel<ResultType, PropType>>;
  executor: PromiseExecutor<ResultType>;
}

const Container = styled.div<{ show: boolean; position: PanelManagerPosition }>`
  width: 680px;
  position: fixed;
  z-index: 99;
  transition: all 0.2s ease-in-out;
  opacity: ${(props) => (props.show ? '1' : '0.25')};

  ${(props) =>
  props.position === PanelManagerPosition.Left &&
  `
    box-shadow: 3px 1px 4px rgba(0, 0, 0, ${props.show ? '0.15' : '0'});
    transform: translateX(${props.show ? '0' : '-100%'});
    height: 100%;
    top: 0;
    left: 0;
  `}
  ${(props) =>
  props.position === PanelManagerPosition.Right &&
  `
    box-shadow: -3px 1px 4px rgba(0, 0, 0, ${props.show ? '0.15' : '0'});
    transform: translateX(${props.show ? '0' : '100%'});
    height: 100%;
    top: 0;
    right: 0;
  `}
`;

const PanelManagerContext = createContext<PanelManagerContext | undefined>(undefined);

export const usePanelManagerContext = (): PanelManagerContext => {
  const panelManagerContext = useContext(PanelManagerContext);
  if (!panelManagerContext) {
    throw new Error('usePanelManagerContext must be used within the PanelMangerProvider.');
  }
  return panelManagerContext;
};

export const PanelManagerContextProvider: FunctionComponent<PanelManagerContextProps> = ({
 position = PanelManagerPosition.Right,
 children
}) => {
  const panelRegistry = useMemo<Record<Key, OpenPanelFunction<unknown>>>(() => ({}), []);
  const [panelExecutorStack, setPanelExecutorStack] = useState<PanelExecutor<unknown, unknown>[]>(
    []
  );
  const [closingPanel, setClosingPanel] = useState<ReactElement<ManagedPanel> | null>();
  const [panels, setPanels] = useState<ReactElement<ManagedPanel>[]>([]);

  useEffect(() => {
    const activePanels = panelExecutorStack.length
      ? panelExecutorStack.map((keyExecutor) => keyExecutor.panel)
      : [closingPanel as ReactElement];
    setPanels(activePanels);
  }, [closingPanel, panelExecutorStack, setPanels]);

  const close = useCallback(<ResultType,>(result: ResultType) => {
    setPanelExecutorStack((stack) => {
      const keyExecutor = stack.pop() as PanelExecutor<unknown, unknown>;
      keyExecutor.executor.resolve(result || null);
      return [...stack];
    });
  }, []);

  const dismiss = useCallback(() => {
    setPanelExecutorStack((stack) => {
      stack.forEach((keyExecutor) => keyExecutor.executor.resolve(null));
      return [];
    });
  }, [setPanelExecutorStack]);

  const open = useCallback(
    <ResultType, PropType>(
      key: Key,
      registerPanelFunction: RegisterPanelFunction<ResultType, PropType>,
      props: PropType
    ): Promise<ResultType | null> => {
      let executor: PromiseExecutor<unknown>;
      const result = new Promise((resolve, reject) => {
        executor = { reject, resolve };
      });
      const panel = registerPanelFunction({
        close: (value: ResultType) => close(value),
        dismiss,
        props
      } as never) as ReactElement<ManagedPanel<unknown, unknown>>;
      setPanelExecutorStack((stack) => {
        const panelExecutor = { executor, panel };
        if (!stack.length) setClosingPanel(panel);
        return [...stack, panelExecutor];
      });
      return result as Promise<ResultType>;
    },
    [close, dismiss]
  );

  const register = useCallback(
    <ResultType, PropType = undefined>(
      registerPanelFunction: RegisterPanelFunction<ResultType, PropType>
    ) => {
      const panel = registerPanelFunction({
        close: (result?: ResultType) => close(result),
        dismiss,
        props: {}
      } as ManagedPanel<ResultType, PropType>);
      if (!panel.key) {
        throw new Error('Panel register requires a ReactElement with a key');
      }
      const openPanelFunction =
        panelRegistry[panel.key] ||
        ((props: PropType) => open(panel.key as Key, registerPanelFunction, props));
      panelRegistry[panel.key] = openPanelFunction;
      return openPanelFunction as OpenPanelFunction<ResultType, PropType>;
    },
    [dismiss, panelRegistry, close, open]
  );

  const value = useMemo(() => ({ dismiss, register }), [dismiss, register]);

  return (
    <PanelManagerContext.Provider value={value}>
      <Container position={position} show={!!panelExecutorStack.length}>
        {panels}
      </Container>
      {children}
    </PanelManagerContext.Provider>
  );
};
