import PropTypes from 'prop-types';
import React from 'react'
import XYGraph from '../XYGraph'
import ReactTooltip from 'react-tooltip'

import { nest, nestStack, merge, sorter } from "../../utils/helpers"

import {
    line,
    area
} from 'd3';

import { properties } from './default.config';

class AreaGraph extends XYGraph {

  yKey   = 'yKey'
  yValue = 'yValue'

  constructor(props) {
    super(props, properties);
  }

  componentWillMount() {
    this.initiate(this.props);
  }

  componentDidMount() {
    const {
      data
    } = this.props;

    if (!data || !data.length)
      return

    this.elementGenerator();
    this.updateElements();
  }

  componentWillReceiveProps(nextProps) {
    if(this.props !== nextProps) {
        this.initiate(nextProps);
    }
  }

  componentDidUpdate() {
    const {
      data
    } = this.props;

    if (!data || !data.length)
      return

    this.updateElements();
  }

  initiate(props) {
    const {
        data,
    } = props;

    if (!data || !data.length)
        return;

    const {
      linesColumn,
      yColumn
    } = this.getConfiguredProperties();

    if(linesColumn) {
      this.yKey = linesColumn
      this.yValue = yColumn
    }

    this.parseData(props);
    this.setDimensions(props, this.getRefinedData(), this.yValue);
    this.updateLegend();
    this.configureAxis({
      data: this.getRefinedData(),
      customYColumn: 'y1'
    });
  }

  getYColumns() {
    return this.yColumns;
  }

  getSequence() {
    return this.sequence
  }

  getRefinedData() {
    return this.refinedData;
  }

  getLegendConfig() {
    return this.legendConfig;
  }

  getRefinedDataNest() {
    return this.dataNest;
  }

  getGraph() {
    return this.getSVG().select('.graph-container');
  }

  handleShowEvent() {
    this.getSVG().select('.tooltip-line').style('opacity', 1);
  }

  handleHideEvent() {
    this.hoveredDatum = null;
    this.getSVG().select('.tooltip-line').style('opacity', 0);
  }

  updateTooltipConfiguration() {
    const {
      tooltip,
      linesColumn,
      yColumn
    } = this.getConfiguredProperties();

    const yColumns = this.getYColumns();
    let updatedTooltip = [];
    
    let insertTooltip = false;
    let format = null;
    
    if(tooltip) {
      tooltip.forEach(t => {

        //Checking whether need to insert all the dynamic values
        if([linesColumn, yColumn].indexOf(t.column) !== -1) {
          insertTooltip = true;

          //If Format is specified for metric column
          if(t.column === yColumn && t.format) {
            format = t.format;
          }
        } else {
          updatedTooltip.push(Object.assign({}, t));
        }

      })

      if(insertTooltip) {
        yColumns.forEach(column => {
          updatedTooltip.push({
            column: column.key,
            format: format
          })
        })
      }
  
      this.setTooltipAccessor(updatedTooltip)
    }
   
  }

  parseData(props) {
    let {
        data
    } = props;

    const {
        yColumn,
        xColumn,
        linesColumn,
        stacked
    } = this.getConfiguredProperties();

    this.data = []
    this.sequence = []

    if(linesColumn) {

      let filteredData = data.filter(item => {
        return (item[linesColumn] && typeof item[linesColumn] !== 'object')
      })

      //Finding all the distinct lines
      this.yColumns = [
        ...new Set(
          filteredData.map(item => item[linesColumn])
        )
      ].map(d => ({key: d}))

      this.data = filteredData;
      this.updateTooltipConfiguration();
      
    } else {

      /**
       * Spliiting yColumns into respective objects
       */
      this.yColumns = typeof yColumn === 'object' ? yColumn : [{ key: yColumn }];

      data.forEach((d) => {
        this.yColumns.forEach((ld, index) => {
          this.data.push(Object.assign({
              [this.yValue]: d[ld.key] !== null ? d[ld.key] : 0,
              [this.yKey]: ld.key,
          }, d));
        })
      })
    }

    //Finding the sequence for yAxis ordering to have smaller area at bottom
    this.sequence = nest({
      data: this.data,
      key: this.yKey,
      sortColumn: this.yValue,
      sortOrder: 'DESC'
    }).sort((a, b) => {
       return b.values[0][this.yValue] - a.values[0][this.yValue]
    }).map(d => d.key)

    //Nesting the data as per x AXIS
    let nestedXPartialData = nest({
        data: this.data,
        key: xColumn,
        sortColumn: this.yKey,
        sortOrder: 'DESC',
        sequence: this.sequence
    })

    /**
     * INSERTING THE MISSING DATA
     */

    let reverseSequence = this.sequence.slice(0).reverse()
    let sequenceLength = this.sequence.length

    let nestedXData = nestedXPartialData.map(item => {
        let d = Object.assign({}, item)

        if(d.values.length === sequenceLength) {
          return d
        }

        d.values = reverseSequence.map(key => {
            let index = (d.values).findIndex(o => {
              return o[this.yKey] === key
            })

            return index !== -1
              ? Object.assign({}, d.values[index])
              : {
                [xColumn]: parseInt(d.key, 10),
                [this.yKey]: key,
                [this.yValue]: 0
              }
        })

        return d
    })

    if(stacked === false) {
      nestedXData.forEach(data => {
        data.values.forEach(value => {
          Object.assign( value, {
            y0: 0,
            y1: value[this.yValue]
          })
        })
      })

    } else {
      nestedXData = nestStack({
        data: nestedXData,
        stackColumn: this.yValue
      })

    }

    this.tooltipData = nestedXData

    //Merging Back with y0 and y1 calculated according to xAxis and now will be used for line plotting
    this.refinedData = merge({
          data: nestedXData,
          fields: [{name: 'values', type: 'array'}]
      }).values

    this.dataNest = nest({
          data: this.refinedData,
          key: this.yKey
        }).sort(sorter({
            column: 'key',
            sequence: this.sequence
          })
        )
  }

  updateLegend() {

    const {
        chartHeightToPixel,
        chartWidthToPixel,
        circleToPixel,
        legend,
    } = this.getConfiguredProperties();

    
    if (legend.show)
    {
        const legendFn   = (d) => (d.value) ? d.value : d.key;
        let legendWidth  = legend.show && this.getYColumns().length >= 1 ? this.longestLabelLength(this.getYColumns(), legendFn) * chartWidthToPixel : 0;
  
        legend.width = legendWidth;

        // Compute the available space considering a legend
        if (this.checkIsVerticalLegend())
        {          
            this.leftMargin      +=  legend.width;
            this.availableWidth  -=  legend.width;
        } else {
            const nbElementsPerLine  = parseInt(this.getAvailableWidth() / legend.width, 10);
            const nbLines            = parseInt(this.getYColumns().length / nbElementsPerLine, 10);
            this.availableHeight    -= nbLines * legend.circleSize * circleToPixel + chartHeightToPixel;
        }
    }
    this.legendConfig = legend;
  }
  

  // generate methods which helps to create charts
  elementGenerator() {

    const svg =  this.getGraph();

    // for generating transition   
    svg.select('.area-chart')
     .append('clipPath')
       .attr('id', `clip-${this.getGraphId()}`)
      .append('rect')
        .attr('width', 0);  
  }
 
  // show circle if data length is 1.
  boundaryCircle() {

    const {
        circleRadius
    } = this.getConfiguredProperties();

    let boundaryCircle = this.getGraph()
      .select('.area-chart')
      .selectAll('.boundaryCircle')
      .data(this.getRefinedData());

    boundaryCircle.enter().append('circle')
        .attr('class', 'boundaryCircle')
        .style('fill', d => this.getColor({'key': d.key}))
        .attr('r', circleRadius)
      .merge(boundaryCircle)
        .attr('cx', d => this.getScale().x(d.xColumn))
        .attr('cy', d => this.getScale().y(d.yValue));

    boundaryCircle.exit().remove();   
  }

  //tooltip circles
  tooltipCircle(data = null) {
    const {
        circleRadius,
        stacked
    } = this.getConfiguredProperties();
    
    const yScale = this.getScale().y;
    const cy     = data 
      ? d => {
        let finalValue = [];
        finalValue = data.filter(value =>  value[this.yKey] === d.key);
        return (finalValue.length && finalValue[0].y1) ? yScale(finalValue[0].y1) : -50;
      } 
      : 1

    const tooltipCircle = this.getGraph()
        .select('.tooltip-line').selectAll('.tooltipCircle')
        .data(this.getRefinedDataNest(), d => d.key);

    tooltipCircle.enter().append('circle')
        .attr('class', 'tooltipCircle')
        .style('fill', stacked === false ? d => this.getColor(d) : 'rgb(255,0,0)')
        .attr('r', circleRadius)
      .merge(tooltipCircle)
        .attr('cx', 0)
        .attr('cy', cy);

    tooltipCircle.exit().remove();
  }

  drawArea() {

    const {
      opacity,
      xColumn,
      transition,
      strokeWidth
    } = this.getConfiguredProperties();

    const scale          = this.getScale();
    const availableHeight = this.getAvailableHeight();

    const lineGenerator = line()
      .x( d => scale.x(d[xColumn]))
      .y( d => scale.y(d.y1));

    const areaGenerator = area()
      .x( d => scale.x(d[xColumn]))
      .y0( d => scale.y(d.y1))
      .y1( d => scale.y(d.y0))

    const svg = this.getGraph();

    svg.select('.area-chart')
      .select(`#clip-${this.getGraphId()}`)
      .select('rect')
        .attr('height', availableHeight);

    const lines = svg.select('.area-chart')
        .selectAll('.line-block')
        .data(this.getRefinedDataNest(), d => d.key );

    const newLines = lines.enter().append('g')
        .attr('class', 'line-block');

    newLines.append('path')
        .attr('class', 'line')
        .style('fill', 'none')
        .style('strokeWidth', strokeWidth)
        .attr('clip-path', `url(#clip-${this.getGraphId()})`);

    const allLines = newLines.merge(lines); 

    allLines.select('.line')
        .style('stroke', d => this.getColor({'key': d.key}))
        .attr('d', d => {

          let data = (d.values)
          
          // Starting Line from xAxis over here
          return lineGenerator([
            Object.assign({}, data[0], {y1: data[0].y0}),
            ...data,
            Object.assign({}, data[data.length-1], {y1: data[data.length-1].y0}),
          ])
        })

    // Add area
    const areas = svg.select('.area-chart')
        .selectAll('.area-block')
        .data(this.getRefinedDataNest(), d => d.key );

    const newAreas = areas.enter()
       .append('g')
       .attr('class', 'area-block');

    newAreas.append('path')
        .attr('class', 'area')
        .attr('fill-opacity', opacity)
        .attr('clip-path', `url(#clip-${this.getGraphId()})`);

    const allAreas = newAreas.merge(areas); 

    allAreas.select('.area')
        .style('fill', d => this.getColor({'key': d.key}))
        .attr('d', d => areaGenerator(d.values));

    // add transition effect
    svg.select(`#clip-${this.getGraphId()} rect`)
        .transition().duration(transition)
        .attr('width', this.availableWidth);

    lines.exit().remove();
    areas.exit().remove();  

  }
 
  // update data on props change or resizing
  updateElements() {
    const {
        data
    } = this.props  

    const {
      xTickFontSize,
      yTickFontSize,
      yLabelLimit
    } = this.getConfiguredProperties();

    const svg =  this.getGraph();

    //Add the X Axis
    svg.select('.xAxis')
      .style('font-size', xTickFontSize)
      .attr('transform', 'translate(0,'+ this.getAvailableHeight() +')')
      .call(this.getAxis().x);
  
    //Add the Y Axis
    const yAxis = svg.select('.yAxis')
      .style('font-size', yTickFontSize)
      .call(this.getAxis().y);

    yAxis.selectAll('.tick text')
      .call(this.wrapD3Text, yLabelLimit)

    this.setAxisTitles();
    this.renderLegendIfNeeded();  

    if(data.length === 1) {
      this.boundaryCircle();
    } else {

      this.drawArea();

      // update tooltip svg
      this.renderTooltip();

      //update hover line
      svg.select('.hover-line')
       .attr('y2', this.getAvailableHeight());

    }
  }

  renderLegendIfNeeded() {
    const {
      stroke,
      colors
    } = this.getConfiguredProperties();

    const scale    = this.scaleColor(this.getYColumns(), 'key');
    this.getColor  = (d) => scale ? scale(d.key ? d.key : d ) : stroke.color || colors[0];
    
    this.renderNewLegend(this.getSequence(), this.getLegendConfig(), this.getColor);
  }

  // Create tooltip data
  renderTooltip() {

    let mergeTooltips = (d) => {
      let records = d.values[0]
      d.values.forEach((o) => {
        records[o[this.yKey]] = o[this.yValue]
      })
      return records
    }

    let scale    = this.getScale();
    let bandwidth = this.getBandScale().x.bandwidth() * 0.8;
    const tooltip = this.getGraph()
        .select('.tooltip-section').selectAll('rect')
        .data(this.tooltipData);

    const newTooltip = tooltip.enter().append('rect')
        .attr('data-for', this.tooltipId)
        .attr('data-effect', 'solid')
        .attr('data-tip', true)
        .attr('y', 0)
        .attr('width', bandwidth) 
        .style('cursor', 'pointer')
        .style('opacity', 0)
        .style('fill', 'red');

    const allTooltip = newTooltip.merge(tooltip);  
    
    allTooltip     
        .attr('x', d => scale.x(d.key) - (bandwidth)/2)
        .attr('height', this.getAvailableHeight())
        .on('mouseover',  d  => this.updateVerticalLine(d))
        .on('mouseenter', d => {
            this.hoveredDatum = mergeTooltips(d)
        })
        .on('mousemove',  d  => {
          this.hoveredDatum = mergeTooltips(d)
        })

    tooltip.exit().remove();
  }

  //update vertical line on mouseover 
  updateVerticalLine(data) {
      ReactTooltip.rebuild();   
      const rightMargin = this.getScale().x(data.key);
      this.tooltipCircle(data.values);
      this.getGraph()
       .select('.tooltip-line')
         .attr('transform', 'translate('+rightMargin+', 0)');  
  }

  render() {

    const {
        data,
        width,
        height
    } = this.props;

    if (!data || !data.length)
        return this.renderMessage('No data to visualize')

    const {
        margin
    } = this.getConfiguredProperties();

    return (
        <div className='stacked-area-graph'>
            
            { this.tooltip }

            <svg width={width} height={height}>
              <g ref={node => this.node = node}>
                <g className='graph-container' transform={ `translate(${this.getLeftMargin()},${margin.top})` }>
                    <g className='area-chart'></g>
                    <g className='tooltip-line' transform={ `translate(0,0)` } style={{opacity : 0}}>
                      <line className='hover-line' style={{stroke:'rgb(255,0,0)'}}></line>
                    </g>
                    <g className='tooltip-section'></g>
                    <g className='xAxis'></g>
                    <g className='yAxis'></g>
                </g>
                <g className='axis-title'>
                  <text className='x-axis-label' textAnchor="middle"></text>
                  <text className='y-axis-label' textAnchor="middle"></text>
                </g>
                <g className='legend'></g>
              </g>  
            </svg>
        </div>
    );
  }
}

AreaGraph.propTypes = {
    configuration: PropTypes.object,
    response: PropTypes.object
};

export default AreaGraph